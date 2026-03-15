import type { DetectionStatus, RedditPostRaw, ScannedPost } from './types';

const KEYWORDS = [
  'game pass',
  'xbox code',
  'game pass code',
  'free code',
  'gamepass code',
  'xbox gift',
  'ms reward',
  'game pass ultimate',
] as const;

/** Matches standard Xbox/Microsoft 25-char redemption code format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX */
const CODE_REGEX = /\b[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}\b/g;

export function detectPost(post: RedditPostRaw): ScannedPost {
  const lowerText = `${post.title} ${post.selftext}`.toLowerCase();
  const upperText = `${post.title} ${post.selftext}`.toUpperCase();

  const matchedKeywords = KEYWORDS.filter((kw) => lowerText.includes(kw));
  const rawCodes = upperText.match(CODE_REGEX) ?? [];
  const detectedCodes = [...new Set(rawCodes)];

  let detectionStatus: DetectionStatus = 'normal';
  if (detectedCodes.length > 0) {
    detectionStatus = 'code_detected';
  } else if (matchedKeywords.length > 0) {
    detectionStatus = 'possible_code';
  }

  return {
    id: post.id,
    title: post.title,
    body: post.selftext,
    author: post.author,
    subreddit: post.subreddit,
    url: `https://www.reddit.com${post.permalink}`,
    permalink: post.permalink,
    createdUtc: post.created_utc,
    score: post.score,
    numComments: post.num_comments,
    detectionStatus,
    detectedCodes,
    matchedKeywords,
    scannedAt: Date.now(),
  };
}
