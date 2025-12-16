import { z } from "zod";

export type FilteredUser = {
  id: string;
  name: string;
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

export type FilteredMovieVariant = {
  variantId: string;
  contentUrl: string;
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

// Compatibility types matching the reference format (v4Api.ts)
export type v4GetMoviesRes =
  | {
      status: "ok";
      code: 200;
      data: PaginatedResponse<FilteredMovie>;
    }
  | v4ErrorRes;

export type v4GetSeriesListRes =
  | {
      status: "ok";
      code: 200;
      data: PaginatedResponse<FilteredSeries>;
    }
  | v4ErrorRes;

export type v4GetSeriesMoviesRes =
  | {
      status: "ok";
      code: 200;
      data: PaginatedResponse<FilteredMovie>;
    }
  | v4ErrorRes;

export type v4GetMovieRes =
  | {
      status: "ok";
      code: 200;
      data: FilteredMovie & { isOwner: boolean };
    }
  | v4ErrorRes;

export type v4GetSeriesRes =
  | {
      status: "ok";
      code: 200;
      data: FilteredSeries;
    }
  | v4ErrorRes;

export type v4GetUserRes =
  | {
      status: "ok";
      code: 200;
      data: FilteredUser;
    }
  | v4ErrorRes;

export type v4PostAuthLoginRes =
  | {
      status: "ok";
      code: 200;
      data: string;
    }
  | v4ErrorRes;

export type v4PostUsersRes =
  | {
      status: "ok";
      code: 200;
      data: {
        user: FilteredUser;
        token: string;
      };
    }
  | v4ErrorRes;

export type v4DeleteAuthLogoutRes =
  | {
      status: "ok";
      code: 200;
      data: null;
    }
  | v4ErrorRes;

export type v4ErrorRes = {
  status: "error";
  code: 400 | 401 | 403 | 404;
  message: string;
};
