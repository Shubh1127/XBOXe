import type { RedditPostRaw } from './types';

export const SUBREDDITS = ['XboxGamePass', 'xbox', 'giveaways', 'GameDeals'] as const;
export type Subreddit = (typeof SUBREDDITS)[number];
const DEFAULT_RETRY_AFTER_MS = 60_000;
const subredditCooldownUntil = new Map<string, number>();

interface RedditApiChild {
  data: RedditPostRaw;
}

interface RedditApiResponse {
  data: {
    children: RedditApiChild[];
  };
}

export async function fetchSubreddit(subreddit: string, limit = 25): Promise<RedditPostRaw[]> {
  const now = Date.now();
  const cooldownUntil = subredditCooldownUntil.get(subreddit) ?? 0;
  if (cooldownUntil > now) {
    return [];
  }

  const res = await fetch(
    `https://www.reddit.com/r/${subreddit}/new.json?limit=${limit}&raw_json=1`,
    {
      headers: {
        'User-Agent': 'XboxGamePassMonitor/1.0 (reddit-code-scanner)',
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  );

  if (res.status === 429) {
    const retryAfter = res.headers.get('retry-after');
    const retryAfterSeconds = Number(retryAfter);
    const retryAfterMs = Number.isFinite(retryAfterSeconds)
      ? retryAfterSeconds * 1000
      : DEFAULT_RETRY_AFTER_MS;

    subredditCooldownUntil.set(subreddit, Date.now() + retryAfterMs);
    console.warn(
      `[redditFetcher] r/${subreddit} rate-limited (429). Backing off for ${Math.ceil(retryAfterMs / 1000)}s.`,
    );
    return [];
  }

  if (!res.ok) {
    throw new Error(`Reddit API error for r/${subreddit}: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as RedditApiResponse;
  return json.data.children.map((c) => c.data);
}

export async function fetchAllSubreddits(
  subreddits: string[] = [...SUBREDDITS],
): Promise<RedditPostRaw[]> {
  const results = await Promise.allSettled(subreddits.map((s) => fetchSubreddit(s)));

  const posts: RedditPostRaw[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      posts.push(...result.value);
    } else {
      console.error('[redditFetcher] Subreddit fetch failed:', result.reason);
    }
  }
  return posts;
}
