import { fetchAllSubreddits, SUBREDDITS } from '@/lib/redditFetcher';
import { detectPost } from '@/lib/codeDetector';
import type { ScannedPost } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const POLL_INTERVAL_MS = 30_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subsParam = searchParams.get('subreddits');

  const validSubs = new Set<string>(SUBREDDITS);
  const subreddits = subsParam
    ? subsParam.split(',').filter((s) => validSubs.has(s))
    : [...SUBREDDITS];

  const encoder = new TextEncoder();
  const seenIds = new Set<string>();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const enqueue = (event: string, payload: unknown) => {
        if (closed) return;
        const chunk = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
        controller.enqueue(encoder.encode(chunk));
      };

      const heartbeat = () => {
        if (closed) return;
        controller.enqueue(encoder.encode(': heartbeat\n\n'));
      };

      const poll = async (): Promise<ScannedPost[] | null> => {
        try {
          const raw = await fetchAllSubreddits(subreddits);
          return raw.map(detectPost);
        } catch (err) {
          console.error('[reddit-stream] Poll error:', err);
          return null;
        }
      };

      // ── Initial load ─────────────────────────────────────────────────────────
      const initial = await poll();
      if (initial) {
        initial.sort((a, b) => b.createdUtc - a.createdUtc);
        initial.forEach((p) => seenIds.add(p.id));
        enqueue('initial', { posts: initial, fetchedAt: Date.now() });
      } else {
        enqueue('server_error', { message: 'Failed to fetch initial posts from Reddit' });
      }

      // ── Polling every 30 s ───────────────────────────────────────────────────
      const pollTimer = setInterval(async () => {
        const all = await poll();
        if (!all) {
          heartbeat();
          return;
        }

        const fresh = all.filter((p) => !seenIds.has(p.id));
        fresh.forEach((p) => seenIds.add(p.id));

        if (fresh.length > 0) {
          fresh.sort((a, b) => b.createdUtc - a.createdUtc);
          enqueue('new_posts', { posts: fresh, fetchedAt: Date.now() });
        } else {
          heartbeat();
        }
      }, POLL_INTERVAL_MS);

      // ── Keep-alive heartbeat every 25 s ──────────────────────────────────────
      const heartbeatTimer = setInterval(heartbeat, 25_000);

      // ── Clean up when client disconnects ─────────────────────────────────────
      request.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(pollTimer);
        clearInterval(heartbeatTimer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
