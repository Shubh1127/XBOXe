import type { DetectionStatus } from '@/lib/types';

const CONFIG = {
  code_detected: {
    text: '🎮 Game Pass Code Detected!',
    className:
      'bg-green-500/15 text-green-400 border-green-500/40 animate-pulse',
  },
  possible_code: {
    text: '⚠️ Possible Code Post',
    className: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/40',
  },
  normal: {
    text: 'Normal Post',
    className: 'bg-gray-700/30 text-gray-500 border-gray-700/40',
  },
} satisfies Record<DetectionStatus, { text: string; className: string }>;

export default function AlertBadge({ status }: { status: DetectionStatus }) {
  const { text, className } = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${className}`}
    >
      {text}
    </span>
  );
}
