import type { SeriesListResponse } from "@/@types/api";
import { useStickySWR } from "@/hooks/useStickySWR";
import { client } from "@/lib/client";

type FetcherKey = {
  query: {
    page: string;
    query?: string;
    author?: string;
  };
};

const fetcher = async (key: FetcherKey): Promise<SeriesListResponse> => {
  const res = await client.api.v4.series.$get(key);
  return res.json();
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
