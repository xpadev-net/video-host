import type { InferResponseType } from "hono";

export type SeriesListApiType =
  typeof import("@/lib/client").client.api.v4.series.$get;
export type SeriesListResponse = InferResponseType<SeriesListApiType>;
