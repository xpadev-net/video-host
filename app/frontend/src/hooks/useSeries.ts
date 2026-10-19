import type { InferResponseType } from "hono";
import { useAtomValue } from "jotai";
import { selectedProfileIdAtom } from "@/atoms/SelectedAccount";
import { useStickySWR } from "@/hooks/useStickySWR";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/client";

const seriesApiClient = client.api.v4.series[":series"].$get;
type SeriesApiType = typeof seriesApiClient;
export type SeriesResponse = InferResponseType<SeriesApiType>;

const fetcher = async ([seriesId, profileId]: readonly [
  string,
  string | null,
  string,
]): Promise<SeriesResponse> => {
  const res = await client.api.v4.series[":series"].$get(
    { query: {}, param: { series: seriesId } },
    { headers: { "X-Profile-Id": profileId ?? "" } },
  );
  const response = await res.json();
  if (!res.ok && (res.status as number) !== 404) {
    throw new Error("Failed to fetch series");
  }
  return response as SeriesResponse;
};

export const useSeries = (query?: string) => {
  const { data: authSession } = authClient.useSession();
  const sessionUserId = authSession?.user.id;
  const selectedProfileId = useAtomValue(selectedProfileIdAtom);
  return useStickySWR(
    query && sessionUserId
      ? ([query, selectedProfileId, sessionUserId] as const)
      : null,
    fetcher,
    {},
  );
};
