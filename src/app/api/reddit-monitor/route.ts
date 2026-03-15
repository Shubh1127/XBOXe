import { type NextRequest, NextResponse } from 'next/server';
import { fetchAllSubreddits, SUBREDDITS } from '@/lib/redditFetcher';
import { detectPost } from '@/lib/codeDetector';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const subsParam = searchParams.get('subreddits');

  const validSubs = new Set<string>(SUBREDDITS);
  const subreddits =
    subsParam
      ? subsParam.split(',').filter((s) => validSubs.has(s))
      : [...SUBREDDITS];

  if (subreddits.length === 0) {
    return NextResponse.json({ error: 'No valid subreddits specified' }, { status: 400 });
  }

  try {
    const rawPosts = await fetchAllSubreddits(subreddits);
    const posts = rawPosts
      .map(detectPost)
      .sort((a, b) => b.createdUtc - a.createdUtc);

    return NextResponse.json({ posts, fetchedAt: Date.now() });
  } catch (err) {
    console.error('[reddit-monitor] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch Reddit posts' }, { status: 500 });
  }
}
