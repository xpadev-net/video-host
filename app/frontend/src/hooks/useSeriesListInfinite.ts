import { useAtomValue } from "jotai";
import useSWRInfinite from "swr/infinite";
import type { SeriesListResponse } from "@/@types/api";
import { selectedProfileIdAtom } from "@/atoms/SelectedAccount";
import { client } from "@/lib/client";

type FetcherKey = {
  query: {
    page: string;
    query?: string;
    author?: string;
  };
  profileId: string | null;
};

export type { SeriesListResponse } from "@/@types/api";

const fetcher = async (key: FetcherKey): Promise<SeriesListResponse> => {
  const { profileId, ...request } = key;
  const res = await client.api.v4.series.$get(request, {
    headers: { "X-Profile-Id": profileId ?? "" },
  });
  const response = await res.json();
  if (!res.ok || response.status !== "ok") {
    throw new Error("Failed to fetch series");
  }
  return response;
};

type Props = {
  query?: string;
  author?: string;
};

export const useSeriesListInfinite = (params?: Props) => {
  const selectedProfileId = useAtomValue(selectedProfileIdAtom);
  const getKey = (
    pageIndex: number,
    previousPageData: SeriesListResponse | null,
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
    SeriesListResponse,
    unknown
  >(getKey, fetcher);

  // 全ページのデータをフラット化
  const series = (data ?? [])
    .flatMap((page) => (page.status === "ok" ? page.data.items : []))
    .filter((item) => item.movies && item.movies.length > 0);
  const lastPage = data?.[size - 1];
  const hasNext =
    !error &&
    (!lastPage ||
      (lastPage.status === "ok" && lastPage.data.pagination.hasNext));
  return {
    series,
    error,
    size,
    setSize,
    mutate,
    hasNext,
    isValidating,
  };
};
