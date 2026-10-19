import type { FormattedMovie } from "@video-host/backend";

export type WatchedHistory = {
  [key: string]: {
    movie: FormattedMovie;
    watched: number;
  };
};
