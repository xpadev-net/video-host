import type { FormattedMovie } from "@video-host/backend";

export const findNext = (data: FormattedMovie) => {
  if (!data?.series) return undefined;
  const currentIndex = data.series.movies?.findIndex(
    (episode) => episode.id === data.id,
  );
  if (currentIndex === -1 || currentIndex === undefined) return undefined;
  return data.series.movies?.[currentIndex + 1];
};

export const findPrev = (data: FormattedMovie) => {
  if (!data?.series) return undefined;
  const currentIndex = data.series.movies?.findIndex(
    (episode) => episode.id === data.id,
  );
  if (currentIndex === -1 || currentIndex === undefined) return undefined;
  return data.series.movies?.[currentIndex - 1];
};
