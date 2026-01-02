import { z } from "zod";

export type FilteredUser = {
  id: string;
  name: string;
  role: "USER" | "ADMIN";
  avatarUrl?: string | null;
};

export type FilteredSeries = {
  id: string;
  title: string;
  description?: string | null;
  visibility: Visibility;
  author: FilteredUser;
  movies?: FilteredMovie[];
  moviesPagination?: PaginationMeta;
};

export type FormattedSeries = Omit<FilteredSeries, "movies"> & {
  movies?: FormattedMovie[];
};

export type FilteredMovie = {
  id: string;
  title: string;
  description?: string | null;
  duration: number;
  variants: FilteredMovieVariant[];
  thumbnailUrl?: string | null;
  visibility: Visibility;
  author: FilteredUser;
  series?: FilteredSeries | null;
  createdAt: Date;
};

export type FormattedMovie = Omit<FilteredMovie, "createdAt" | "series"> & {
  createdAt: string;
  series?: FormattedSeries | null;
};

export type FilteredMovieVariant = {
  variantId: string;
  contentUrl: string;
  status: "PROCESSING" | "READY" | "FAILED";
};

export type FilteredPlaylist = {
  id: string;
  title: string;
  description?: string | null;
  visibility: Visibility;
  author: FilteredUser;
  movies?: FilteredMovie[];
};

export const ZVisibility = z.union([
  z.literal("PUBLIC"),
  z.literal("UNLISTED"),
  z.literal("PRIVATE"),
]);

export type Visibility = z.infer<typeof ZVisibility>;

export type PaginationMeta = {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
};

export type PaginatedResponse<T> = {
  items: T[];
  pagination: PaginationMeta;
};
