import type {
  FilteredMovie,
  FilteredSeries,
  FormattedMovie,
  FormattedSeries,
} from "@/types";

export const formatMovie = (movie: FilteredMovie): FormattedMovie => {
  return {
    ...movie,
    createdAt: movie.createdAt.toISOString(),
    series: movie.series ? formatSeries(movie.series) : undefined,
  };
};

export const formatSeries = (series: FilteredSeries): FormattedSeries => {
  return {
    ...series,
    movies: series.movies?.map(formatMovie),
  };
};
