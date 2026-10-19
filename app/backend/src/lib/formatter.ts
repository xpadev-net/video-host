import type {
  FilteredMovie,
  FilteredPlaylist,
  FilteredSeries,
  FormattedMovie,
  FormattedPlaylist,
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

export const formatPlaylist = (
  playlist: FilteredPlaylist,
): FormattedPlaylist => {
  return {
    ...playlist,
    movies: playlist.movies?.map(formatMovie),
  };
};
