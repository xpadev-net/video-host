import useSWRInfinite from "swr/infinite";

import type { v4GetMoviesRes } from "@/@types/v4Api";
import { client } from "@/lib/client";

// Define the Key type matching what getKey returns and fetcher expects
type FetcherKey = {
  query: {
    page: string;
    query?: string;
    author?: string;
  };
};

const fetcher = async (key: FetcherKey): Promise<v4GetMoviesRes> => {
  const res = await client.api.v4.movies.$get(key);
  return (await res.json()) as unknown as v4GetMoviesRes;
};

type Props = {
  query?: string;
  author?: string;
};

export const useMovies = (params?: Props) => {
  const getKey = (
    pageIndex: number,
    previousPageData: v4GetMoviesRes | null,
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
    v4GetMoviesRes,
    unknown
  >(getKey, fetcher);

  // 全ページのデータをフラット化
  const movies =
    (
      data?.flatMap((page) => (page.status === "ok" ? page.data.items : [])) ??
      []
    ).filter((item) => item.duration > 0) || [];
  const lastPage = data?.[size - 1];
  const hasNext = lastPage?.status !== "ok" || lastPage.data.pagination.hasNext;
  return {
    movies,
    error,
    size,
    setSize,
    hasNext,
    isValidating,
  };
};
