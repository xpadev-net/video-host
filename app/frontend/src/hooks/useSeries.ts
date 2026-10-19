import type { InferResponseType } from "hono";
import { useStickySWR } from "@/hooks/useStickySWR";
import { client } from "@/lib/client";

const seriesApiClient = client.api.v4.series[":series"].$get;
type SeriesApiType = typeof seriesApiClient;
export type SeriesResponse = InferResponseType<SeriesApiType>;

const fetcher = async (key: string): Promise<SeriesResponse> => {
  const res = await client.api.v4.series[":series"].$get({
    query: {},
    param: { series: key },
  });
  const response = await res.json();
  if (!res.ok && (res.status as number) !== 404) {
    throw new Error("Failed to fetch series");
  }
  return response as SeriesResponse;
};

export const useSeries = (query?: string) => {
  return useStickySWR(query, fetcher, {});
};
