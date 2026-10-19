import { useAtomValue } from "jotai";
import { selectedProfileIdAtom } from "@/atoms/SelectedAccount";
import { useStickySWR } from "@/hooks/useStickySWR";
import { authClient } from "@/lib/auth-client";

import { client } from "@/lib/client";

const fetcher = async ([movieId, profileId]: readonly [
  string,
  string | null,
  string,
]) => {
  const res = await client.api.v4.movies[":movie"].$get(
    { param: { movie: movieId } },
    { headers: { "X-Profile-Id": profileId ?? "" } },
  );
  const response = await res.json();
  if (!res.ok && (res.status as number) !== 404) {
    throw new Error("Failed to fetch movie");
  }
  return response;
};

export const useMovie = (query?: string) => {
  const { data: authSession } = authClient.useSession();
  const sessionUserId = authSession?.user.id;
  const selectedProfileId = useAtomValue(selectedProfileIdAtom);
  // Playback URLs embed a token that expires after 6+ hours; refetching well
  // before that hands a long-running player a fresh URL (SWR keeps the old
  // data object while the response is unchanged, so nothing reloads until
  // the token actually rotates).
  return useStickySWR(
    query && sessionUserId
      ? ([query, selectedProfileId, sessionUserId] as const)
      : null,
    fetcher,
    {
      refreshInterval: 30 * 60 * 1000,
      refreshWhenHidden: true,
    },
  );
};
