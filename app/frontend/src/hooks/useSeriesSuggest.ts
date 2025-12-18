import type { v4GetSeriesListRes } from "@/@types/v4Api";
import { useStickySWR } from "@/hooks/useStickySWR";
import { client } from "@/lib/client";

const fetcher = async (key: string): Promise<v4GetSeriesListRes> => {
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

  return (await res.json()) as unknown as v4GetSeriesListRes;
};

type Props = {
  query: string;
};

export const useSeriesSuggest = (data?: Props) => {
  return useStickySWR(data?.query, fetcher, {});
};
