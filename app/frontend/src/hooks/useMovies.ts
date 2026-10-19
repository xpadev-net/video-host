import type { InferResponseType } from "hono";
import { useAtomValue } from "jotai";
import useSWRInfinite from "swr/infinite";
import { selectedProfileIdAtom } from "@/atoms/SelectedAccount";
import { client } from "@/lib/client";

// Define the Key type matching what getKey returns and fetcher expects
type FetcherKey = {
  query: {
    page: string;
    query?: string;
    author?: string;
  };
  profileId: string | null;
};

type MoviesResponseType = typeof client.api.v4.movies.$get;
export type MoviesResponse = InferResponseType<MoviesResponseType>;

const fetcher = async (key: FetcherKey) => {
  const { profileId, ...request } = key;
  const res = await client.api.v4.movies.$get(request, {
    headers: { "X-Profile-Id": profileId ?? "" },
  });
  const response = await res.json();
  if (!res.ok || response.status !== "ok") {
    throw new Error("Failed to fetch movies");
  }
  return response;
};

type Props = {
  query?: string;
  author?: string;
};

export const useMovies = (params?: Props) => {
  const selectedProfileId = useAtomValue(selectedProfileIdAtom);
  const getKey = (
    pageIndex: number,
    previousPageData: MoviesResponse | null,
  ) => {
    // データが空配列ならこれ以上取得しない
    if (
      previousPageData &&
      (previousPageData.status !== "ok" ||
        !previousPageData.data.pagination.hasNext)
    )
      return null;

    return {
      query: {
        page: (pageIndex + 1).toString(),
        query: params?.query,
        author: params?.author,
      },
      profileId: selectedProfileId,
    };
  };

  const { data, error, size, setSize, isValidating, mutate } = useSWRInfinite<
    MoviesResponse,
    unknown
  >(getKey, fetcher);

  // 全ページのデータをフラット化
  const movies = (data ?? [])
    .flatMap((page) => (page.status === "ok" ? page.data.items : []))
    .filter((item) => item.duration > 0);
  const lastPage = data?.[size - 1];
  const hasNext =
    !error &&
    (!lastPage ||
      (lastPage.status === "ok" && lastPage.data.pagination.hasNext));
  return {
    movies,
    error,
    size,
    setSize,
    mutate,
    hasNext,
    isValidating,
  };
};
