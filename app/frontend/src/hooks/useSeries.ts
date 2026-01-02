import type { InferResponseType } from "hono";
import { useStickySWR } from "@/hooks/useStickySWR";
import { client } from "@/lib/client";

const seriesApiClient = client.api.v4.series[":series"].$get;
type SeriesApiType = typeof seriesApiClient;
export type SeriesResponse = InferResponseType<SeriesApiType>;

const fetcher = async (key?: string): Promise<SeriesResponse> => {
  if (!key) throw new Error("no series");
  const res = await client.api.v4.series[":series"].$get({
    param: { series: key },
  });
  return (await res.json()) as SeriesResponse;
};

export const useSeries = (query?: string) => {
  return useStickySWR(query, fetcher, {});
};
