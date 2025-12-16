import type {
  FilteredMovie,
  FilteredMovieVariant,
  FilteredPlaylist,
  FilteredSeries,
  FilteredUser,
} from "@/@types/models";

export const filterUser = (user: FilteredUser): FilteredUser => {
  return {
    id: user.id,
    name: user.name,
    avatarUrl: user.avatarUrl,
  };
};

export const filterSeries = (series: FilteredSeries): FilteredSeries => {
  return {
    id: series.id,
    title: series.title,
    description: series.description,
    visibility: series.visibility,
    author: filterUser(series.author),
    movies: series.movies?.map(filterMovie),
  };
};

export const filterMovie = (episode: FilteredMovie): FilteredMovie => {
  return {
    id: episode.id,
    title: episode.title,
    description: episode.description,
    duration: episode.duration,
    variants: episode.variants.map(filterMovieVariant),
    thumbnailUrl: episode.thumbnailUrl,
    visibility: episode.visibility,
    author: filterUser(episode.author),
    series: episode.series ? filterSeries(episode.series) : undefined,
    createdAt: episode.createdAt,
  };
};

export const filterMovieVariant = (
  variant: FilteredMovieVariant,
): FilteredMovieVariant => {
  return {
    variantId: variant.variantId,
    contentUrl: variant.contentUrl,
    status: variant.status,
  };
};

export const filterPlaylist = (
  playlist: Omit<FilteredPlaylist, "movies"> & {
    movies?: { movie: FilteredMovie }[];
  },
): FilteredPlaylist => {
  return {
    id: playlist.id,
    title: playlist.title,
    description: playlist.description,
    visibility: playlist.visibility,
    author: filterUser(playlist.author),
    movies: playlist.movies?.map((m: { movie: FilteredMovie }) =>
      filterMovie(m.movie),
    ),
  };
};
