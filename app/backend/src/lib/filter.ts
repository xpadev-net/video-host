import type {
  FilteredMovie,
  FilteredMovieVariant,
  FilteredPlaylist,
  FilteredSeries,
  FilteredUser,
  Visibility,
} from "@/@types/models";
import { signVodContentUrl, signVodThumbnailUrl } from "@/lib/vod-token";

export const filterUser = (user: FilteredUser): FilteredUser => {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    avatarUrl: user.avatarUrl,
  };
};

// A User row plus its viewer memberships, as loaded for the owner.
type OwnedUser = FilteredUser & {
  role?: "USER" | "ADMIN";
  visibility?: Visibility;
  profileViewers?: { user: FilteredUser }[];
};

/** The requester's own profile: the only place `role` is exposed. */
export const filterSelf = (user: OwnedUser): FilteredUser => {
  return {
    ...filterUser(user),
    role: user.role,
    visibility: user.visibility,
    viewers: user.profileViewers?.map((membership) =>
      filterUser(membership.user),
    ),
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
    thumbnailUrl: signVodThumbnailUrl(episode.thumbnailUrl),
    visibility: episode.visibility,
    author: filterUser(episode.author),
    series: episode.series ? filterSeries(episode.series) : undefined,
    createdAt: episode.createdAt,
    viewers: episode.viewers?.map(filterUser),
  };
};

export const filterMovieVariant = (
  variant: FilteredMovieVariant & { s3Key?: string | null },
): FilteredMovieVariant => {
  return {
    variantId: variant.variantId,
    // Playback URLs carry a short-lived token bound to the stored key; the
    // VOD mapping endpoint rejects requests without a valid one.
    contentUrl: signVodContentUrl(variant.contentUrl, variant.s3Key),
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
