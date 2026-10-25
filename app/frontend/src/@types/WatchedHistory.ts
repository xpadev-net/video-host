export type WatchedHistoryEntry = {
  movieId: string;
  title: string;
  thumbnailUrl: string | null;
  duration: number;
  watched: number;
  updatedAt: number;
};

export type WatchedHistory = Record<string, WatchedHistoryEntry>;
