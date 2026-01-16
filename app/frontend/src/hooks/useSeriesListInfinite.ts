import useSWRInfinite from "swr/infinite";
import type { SeriesListResponse } from "@/@types/api";
import { client } from "@/lib/client";

type FetcherKey = {
  query: {
    page: string;
    query?: string;
    author?: string;
  };
};

export type { SeriesListResponse } from "@/@types/api";

const fetcher = async (key: FetcherKey): Promise<SeriesListResponse> => {
  const res = await client.api.v4.series.$get(key);
  return res.json();
};

type Props = {
  query?: string;
  author?: string;
};

export const useSeriesListInfinite = (params?: Props) => {
  const getKey = (
    pageIndex: number,
    previousPageData: SeriesListResponse | null,
  ) => {
    // データが空配列ならこれ以上取得しない
    if (
      previousPageData &&
      previousPageData.status === "ok" &&
      !previousPageData.data.pagination.hasNext
    )
      return null;
    return {
      query: {
        page: (pageIndex + 1).toString(),
        query: params?.query,
        author: params?.author,
      },
    };
  };

  const { data, error, size, setSize, isValidating } = useSWRInfinite<
    SeriesListResponse,
    unknown
  >(getKey, fetcher);

  // 全ページのデータをフラット化
  const series =
    (
      data?.flatMap((page) => (page.status === "ok" ? page.data.items : [])) ??
      []
    ).filter((item) => item.movies && item.movies.length > 0) || [];
  const lastPage = data?.[size - 1];
  const hasNext = lastPage?.status !== "ok" || lastPage.data.pagination.hasNext;
  return {
    series,
    error,
    size,
    setSize,
    hasNext,
    isValidating,
  };
};
