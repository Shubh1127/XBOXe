'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ScannedPost } from '@/lib/types';
import PostCard from './PostCard';

const ALL_SUBREDDITS = ['XboxGamePass', 'xbox', 'giveaways', 'GameDeals'] as const;
const POLL_INTERVAL_MS = 30_000;
type Subreddit = (typeof ALL_SUBREDDITS)[number];
type ConnectionStatus = 'connecting' | 'connected' | 'error';
type FilterStatus = 'all' | 'code_detected' | 'possible_code';

// ── Audio alert using Web Audio API ──────────────────────────────────────────
function playBeep() {
  try {
    interface WindowWithWebkit extends Window {
      webkitAudioContext?: typeof AudioContext;
    }
    const AC =
      window.AudioContext ||
      (window as WindowWithWebkit).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.3);
    gain.gain.setValueAtTime(0.35, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    void ctx.close();
  } catch {
    // AudioContext not supported
  }
}

// ── Browser notification helper ───────────────────────────────────────────────
function sendBrowserNotification(title: string, body: string) {
  if (
    typeof window !== 'undefined' &&
    'Notification' in window &&
    Notification.permission === 'granted'
  ) {
    new Notification(title, { body, icon: '/favicon.ico' });
  }
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({
  value,
  label,
  color,
}: {
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4">
      <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-gray-500 text-xs mt-1">{label}</p>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [posts, setPosts] = useState<ScannedPost[]>([]);
  const [newPostIds, setNewPostIds] = useState<Set<string>>(new Set());
  const [visibleSubreddits, setVisibleSubreddits] = useState<Set<Subreddit>>(
    new Set(ALL_SUBREDDITS),
  );
  const [keyword, setKeyword] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Stable refs so callbacks don't recreate on state changes
  const seenIdsRef = useRef(new Set<string>());
  const soundEnabledRef = useRef(true);
  const notifEnabledRef = useRef(false);
  const hasLoadedInitialRef = useRef(false);

  // Keep refs in sync with state
  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);
  useEffect(() => { notifEnabledRef.current = notifEnabled; }, [notifEnabled]);

  // ── Process incoming posts (stable callback) ────────────────────────────────
  const handleNewPosts = useCallback((incoming: ScannedPost[], isInitial: boolean) => {
    const fresh = incoming.filter((p) => !seenIdsRef.current.has(p.id));
    if (fresh.length === 0) return;
    fresh.forEach((p) => seenIdsRef.current.add(p.id));

    if (!isInitial) {
      const alerts = fresh.filter((p) => p.detectionStatus !== 'normal');
      if (alerts.length > 0) {
        if (soundEnabledRef.current) playBeep();
        if (notifEnabledRef.current) {
          alerts.forEach((a) =>
            sendBrowserNotification(
              a.detectionStatus === 'code_detected'
                ? '🎮 Game Pass Code Found!'
                : '⚠️ Possible Code Post',
              `r/${a.subreddit}: ${a.title.slice(0, 100)}`,
            ),
          );
        }
      }

      // Flash NEW badge for 6 s
      const freshIdSet = new Set(fresh.map((p) => p.id));
      setNewPostIds((prev) => new Set([...prev, ...freshIdSet]));
      setTimeout(() => {
        setNewPostIds((prev) => {
          const next = new Set(prev);
          freshIdSet.forEach((id) => next.delete(id));
          return next;
        });
      }, 6000);
    }

    setPosts((prev) => {
      const merged = isInitial ? fresh : [...fresh, ...prev];
      const map = new Map(merged.map((p) => [p.id, p]));
      return Array.from(map.values())
        .sort((a, b) => b.createdUtc - a.createdUtc)
        .slice(0, 500); // keep at most 500 posts for performance
    });

    setLastUpdated(new Date());
  }, []);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/reddit-monitor', { cache: 'no-store' });
      if (!res.ok) return;

      const data = (await res.json()) as { posts?: ScannedPost[] };
      const isInitial = !hasLoadedInitialRef.current;
      hasLoadedInitialRef.current = true;
      handleNewPosts(data.posts ?? [], isInitial);
      setConnectionStatus('connected');
    } catch {
      // keep existing connection state when fallback request fails
    }
  }, [handleNewPosts]);

  // ── SSE connection ──────────────────────────────────────────────────────────
  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let fallbackPollTimer: ReturnType<typeof setInterval> | null = null;
    let mounted = true;

    const connect = () => {
      if (!mounted) return;
      setConnectionStatus('connecting');

      es = new EventSource('/api/reddit-stream');

      es.addEventListener('initial', (e: MessageEvent) => {
        if (!mounted) return;
        const data = JSON.parse(e.data as string) as { posts: ScannedPost[] };
        setConnectionStatus('connected');
        const isReallyInitial = !hasLoadedInitialRef.current;
        hasLoadedInitialRef.current = true;
        handleNewPosts(data.posts ?? [], isReallyInitial);
      });

      es.addEventListener('new_posts', (e: MessageEvent) => {
        if (!mounted) return;
        const data = JSON.parse(e.data as string) as { posts: ScannedPost[] };
        setConnectionStatus('connected');
        handleNewPosts(data.posts ?? [], false);
      });

      es.addEventListener('server_error', (e: MessageEvent) => {
        console.error('[SSE] Server error:', e.data);
      });

      es.onerror = () => {
        if (!mounted) return;
        setConnectionStatus('error');
        es?.close();
        retryTimer = setTimeout(connect, 5000);
      };

      fallbackPollTimer = setInterval(() => {
        void fetchSnapshot();
      }, POLL_INTERVAL_MS);
    };

    connect();
    void fetchSnapshot();

    return () => {
      mounted = false;
      es?.close();
      if (retryTimer) clearTimeout(retryTimer);
      if (fallbackPollTimer) clearInterval(fallbackPollTimer);
    };
  }, [fetchSnapshot, handleNewPosts]);

  // ── Subreddit visibility toggle ─────────────────────────────────────────────
  const toggleSubreddit = (sub: Subreddit) => {
    setVisibleSubreddits((prev) => {
      const next = new Set(prev);
      if (next.has(sub)) {
        if (next.size > 1) next.delete(sub); // always keep at least one
      } else {
        next.add(sub);
      }
      return next;
    });
  };

  // ── Notification permission ─────────────────────────────────────────────────
  const requestNotifPermission = async () => {
    if ('Notification' in window) {
      const perm = await Notification.requestPermission();
      if (perm === 'granted') setNotifEnabled(true);
    }
  };

  // ── Clear feed ──────────────────────────────────────────────────────────────
  const clearPosts = () => {
    setPosts([]);
    seenIdsRef.current.clear();
    setNewPostIds(new Set());
    hasLoadedInitialRef.current = false;
  };

  // ── Filtered view ───────────────────────────────────────────────────────────
  const filteredPosts = posts.filter((p) => {
    if (!visibleSubreddits.has(p.subreddit as Subreddit)) return false;
    if (filterStatus !== 'all' && p.detectionStatus !== filterStatus) return false;
    if (keyword.trim()) {
      const kw = keyword.toLowerCase();
      return p.title.toLowerCase().includes(kw) || p.body.toLowerCase().includes(kw);
    }
    return true;
  });

  const stats = {
    total: posts.length,
    codes: posts.filter((p) => p.detectionStatus === 'code_detected').length,
    possible: posts.filter((p) => p.detectionStatus === 'possible_code').length,
  };

  // ── Connection indicator ────────────────────────────────────────────────────
  const statusConfig = {
    connecting: { dot: 'bg-yellow-400 animate-pulse', text: 'Connecting…', textColor: 'text-yellow-400' },
    connected:  { dot: 'bg-green-400 animate-pulse',  text: 'Live',          textColor: 'text-green-400'  },
    error:      { dot: 'bg-red-400 animate-pulse',    text: 'Reconnecting…', textColor: 'text-red-400'    },
  }[connectionStatus];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">

      {/* ── Header ── */}
      <header className="sticky top-0 z-50 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-gradient-to-br from-green-500 to-green-700 rounded-xl flex items-center justify-center text-xl shadow-lg shadow-green-900/40 shrink-0">
              🎮
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">
                Xbox Game Pass Monitor
              </h1>
              <p className="text-gray-500 text-xs">Real-time Reddit code scanner</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="hidden sm:block text-gray-600 text-xs">
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <div className="flex items-center gap-1.5 bg-gray-800/80 border border-gray-700/50 px-2.5 py-1.5 rounded-full">
              <div className={`w-2 h-2 rounded-full ${statusConfig.dot}`} />
              <span className={`text-xs font-medium ${statusConfig.textColor}`}>
                {statusConfig.text}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-5">

        {/* ── Controls panel ── */}
        <div className="bg-gray-900/80 rounded-2xl border border-gray-800 p-4 space-y-3">

          {/* Subreddit toggles + action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-gray-400 text-xs font-semibold uppercase tracking-wider shrink-0">
              Watch:
            </span>
            {ALL_SUBREDDITS.map((sub) => {
              const active = visibleSubreddits.has(sub);
              return (
                <button
                  key={sub}
                  onClick={() => toggleSubreddit(sub)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200 cursor-pointer ${
                    active
                      ? 'bg-green-600/20 text-green-400 border-green-600/40'
                      : 'bg-transparent text-gray-500 border-gray-700 hover:border-gray-600 hover:text-gray-400'
                  }`}
                >
                  r/{sub}
                </button>
              );
            })}

            <div className="ml-auto flex items-center gap-1.5">
              {/* Sound toggle */}
              <button
                onClick={() => setSoundEnabled((v) => !v)}
                title={soundEnabled ? 'Mute alerts' : 'Enable sound alerts'}
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm border transition-colors cursor-pointer ${
                  soundEnabled
                    ? 'bg-blue-600/20 border-blue-600/40 text-blue-400'
                    : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-400'
                }`}
              >
                {soundEnabled ? '🔊' : '🔇'}
              </button>

              {/* Notification toggle */}
              <button
                onClick={requestNotifPermission}
                title="Enable browser notifications"
                className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm border transition-colors cursor-pointer ${
                  notifEnabled
                    ? 'bg-blue-600/20 border-blue-600/40 text-blue-400'
                    : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-400'
                }`}
              >
                🔔
              </button>

              {/* Clear feed */}
              <button
                onClick={clearPosts}
                className="px-3 h-8 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 hover:text-gray-200 rounded-lg text-xs transition-colors cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Search + status filter */}
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              placeholder="Search post title or body…"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              className="flex-1 min-w-[180px] bg-gray-800/80 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-green-600/60 focus:ring-1 focus:ring-green-600/20 transition-colors"
            />

            <div className="flex gap-1 bg-gray-800/80 border border-gray-700 rounded-lg p-1">
              {(
                [
                  { value: 'all',           label: 'All',          active: 'bg-gray-600'   },
                  { value: 'code_detected', label: '🎮 Codes',     active: 'bg-green-700'  },
                  { value: 'possible_code', label: '⚠️ Possible',  active: 'bg-yellow-700' },
                ] as const
              ).map(({ value, label, active }) => (
                <button
                  key={value}
                  onClick={() => setFilterStatus(value as FilterStatus)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    filterStatus === value
                      ? `${active} text-white`
                      : 'text-gray-400 hover:text-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-3 gap-3">
          <StatCard value={stats.total}    label="Posts Scanned"  color="text-gray-200"   />
          <StatCard value={stats.codes}    label="Codes Found"    color="text-green-400"  />
          <StatCard value={stats.possible} label="Possible Codes" color="text-yellow-400" />
        </div>

        {/* ── Post feed ── */}
        <div className="space-y-3">
          {connectionStatus === 'connecting' && posts.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 text-gray-600">
              <div className="w-10 h-10 border-2 border-green-600/60 border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-sm">Fetching latest Reddit posts…</p>
            </div>
          )}

          {filteredPosts.length === 0 && connectionStatus === 'connected' && (
            <div className="text-center py-20 text-gray-600">
              <p className="text-5xl mb-4">📭</p>
              <p className="text-sm">No posts match the current filter.</p>
              <p className="text-xs mt-1 text-gray-700">
                New posts will appear automatically every 30 seconds.
              </p>
            </div>
          )}

          {filteredPosts.map((post) => (
            <PostCard key={post.id} post={post} isNew={newPostIds.has(post.id)} />
          ))}
        </div>
      </main>

      <footer className="py-10 text-center text-gray-700 text-xs">
        Polls Reddit every 30 s&nbsp;·&nbsp;{filteredPosts.length} of {posts.length} posts displayed&nbsp;·&nbsp;
        <a
          href="https://www.reddit.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-gray-500 transition-colors"
        >
          Data from reddit.com
        </a>
      </footer>
    </div>
  );
}
