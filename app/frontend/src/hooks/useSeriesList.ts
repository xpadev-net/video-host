import type { v4GetSeriesListRes } from "@/@types/v4Api";
import { useStickySWR } from "@/hooks/useStickySWR";
import { client } from "@/lib/client";

type FetcherKey = {
  query: {
    page: string;
    query?: string;
    author?: string;
  };
};

const fetcher = async (key: FetcherKey): Promise<v4GetSeriesListRes> => {
  const res = await client.api.v4.series.$get(key);
  return (await res.json()) as unknown as v4GetSeriesListRes;
};

type Props = {
  page?: number;
  query?: string;
  author?: string;
};

export const useSeriesList = (data?: Props) => {
  const page = data?.page || 1;
  const query = data?.query || undefined;
  const author = data?.author || undefined;

  return useStickySWR(
    {
      query: {
        page: page.toString(),
        query,
        author,
      },
    },
    fetcher,
    {},
  );
};
