'use client';

import { useState } from 'react';
import type { ScannedPost } from '@/lib/types';
import AlertBadge from './AlertBadge';

function formatRelativeTime(utcSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000 - utcSeconds);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 px-2 py-0.5 rounded text-xs bg-green-700/30 hover:bg-green-700/50 text-green-400 border border-green-700/40 transition-colors cursor-pointer"
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
}

const SUB_COLORS: Record<string, string> = {
  XboxGamePass: 'bg-green-600/20 text-green-400',
  xbox: 'bg-blue-600/20 text-blue-400',
  giveaways: 'bg-purple-600/20 text-purple-400',
  GameDeals: 'bg-orange-600/20 text-orange-400',
};

const CARD_BORDER: Record<string, string> = {
  code_detected: 'border-green-500/50 shadow-green-900/30',
  possible_code: 'border-yellow-500/40 shadow-yellow-900/20',
  normal: 'border-gray-800',
};

const CARD_BG: Record<string, string> = {
  code_detected: 'bg-green-950/25',
  possible_code: 'bg-yellow-950/15',
  normal: 'bg-gray-900/60',
};

interface PostCardProps {
  post: ScannedPost;
  isNew?: boolean;
}

export default function PostCard({ post, isNew = false }: PostCardProps) {
  return (
    <div
      className={`relative rounded-xl border shadow-sm ${CARD_BORDER[post.detectionStatus]} ${CARD_BG[post.detectionStatus]} p-4 transition-all duration-300 ${isNew ? 'animate-slide-in' : ''}`}
    >
      {/* NEW badge */}
      {isNew && (
        <div className="absolute -top-2 right-4 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide z-10">
          New
        </div>
      )}

      {/* Top row: subreddit + status + time */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span
          className={`px-2 py-0.5 rounded-md text-xs font-semibold ${SUB_COLORS[post.subreddit] ?? 'bg-gray-700/40 text-gray-400'}`}
        >
          r/{post.subreddit}
        </span>
        <AlertBadge status={post.detectionStatus} />
        <span className="ml-auto text-gray-600 text-xs shrink-0">
          {formatRelativeTime(post.createdUtc)}
        </span>
      </div>

      {/* Title */}
      <h2 className="text-gray-100 text-sm font-semibold leading-snug mb-1.5 line-clamp-2">
        {post.title}
      </h2>

      {/* Meta info */}
      <p className="text-gray-600 text-xs mb-2">
        u/{post.author}&nbsp;·&nbsp;↑&nbsp;{post.score}&nbsp;·&nbsp;💬&nbsp;{post.numComments}
      </p>

      {/* Matched keywords */}
      {post.matchedKeywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {post.matchedKeywords.map((kw) => (
            <span
              key={kw}
              className="px-1.5 py-0.5 bg-yellow-900/30 text-yellow-300 border border-yellow-800/40 rounded text-xs"
            >
              &quot;{kw}&quot;
            </span>
          ))}
        </div>
      )}

      {/* Detected codes */}
      {post.detectedCodes.length > 0 && (
        <div className="mt-2 space-y-1.5">
          <p className="text-green-500 text-[11px] font-semibold uppercase tracking-wider">
            Detected Code{post.detectedCodes.length > 1 ? 's' : ''}
          </p>
          {post.detectedCodes.map((code) => (
            <div
              key={code}
              className="flex items-center bg-black/40 border border-green-800/50 rounded-lg px-3 py-2"
            >
              <code className="text-green-300 font-mono text-sm flex-1 select-all">{code}</code>
              <CopyButton text={code} />
            </div>
          ))}
        </div>
      )}

      {/* Footer: scan time + Reddit link */}
      <div className="mt-3 flex items-center justify-between">
        <span className="text-gray-700 text-[11px]">
          Scanned {new Date(post.scannedAt).toLocaleTimeString()}
        </span>
        <a
          href={post.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-gray-200 rounded-lg text-xs font-medium border border-gray-700 hover:border-gray-600 transition-colors"
        >
          View Post&nbsp;↗
        </a>
      </div>
    </div>
  );
}
