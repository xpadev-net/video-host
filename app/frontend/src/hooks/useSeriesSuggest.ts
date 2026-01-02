import type { InferResponseType } from "hono";
import { useStickySWR } from "@/hooks/useStickySWR";
import { client } from "@/lib/client";

type SeriesListApiType = typeof client.api.v4.series.$get;
type SeriesListResponse = InferResponseType<SeriesListApiType>;

const fetcher = async (key: string): Promise<SeriesListResponse> => {
  if (key.length < 2) {
    return {
      status: "ok",
      code: 200,
      data: {
        items: [],
        pagination: {
          page: 1,
          hasNext: false,
          totalCount: 0,
          totalPages: 0,
          limit: 0,
          hasPrev: false,
        },
      },
    };
  }

  const res = await client.api.v4.series.$get({
    query: {
      query: key,
      suggest: "1",
    },
  });

  return await res.json();
};

type Props = {
  query: string;
};

export const useSeriesSuggest = (data?: Props) => {
  return useStickySWR(data?.query, fetcher, {});
};
