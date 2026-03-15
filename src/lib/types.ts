export interface RedditPostRaw {
  id: string;
  title: string;
  selftext: string;
  author: string;
  subreddit: string;
  url: string;
  permalink: string;
  created_utc: number;
  score: number;
  num_comments: number;
}

export type DetectionStatus = 'code_detected' | 'possible_code' | 'normal';

export interface ScannedPost {
  id: string;
  title: string;
  body: string;
  author: string;
  subreddit: string;
  url: string;
  permalink: string;
  createdUtc: number;
  score: number;
  numComments: number;
  detectionStatus: DetectionStatus;
  detectedCodes: string[];
  matchedKeywords: string[];
  scannedAt: number;
}
