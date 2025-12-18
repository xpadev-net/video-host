import type { v4GetSeriesRes } from "@/@types/v4Api";
import { useStickySWR } from "@/hooks/useStickySWR";

import { client } from "@/lib/client";

const fetcher = async (key?: string): Promise<v4GetSeriesRes> => {
  if (!key)
    return Promise.resolve({
      status: "error" as const,
      code: 404,
      message: "not found",
    });
  const res = await client.api.v4.series[":series"].$get({
    param: { series: key },
  });
  return (await res.json()) as v4GetSeriesRes;
};

export const useSeries = (query?: string) => {
  return useStickySWR(query, fetcher, {});
};
