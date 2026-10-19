import { useStickySWR } from "@/hooks/useStickySWR";

import { client } from "@/lib/client";

const fetcher = async (key: string) => {
  const res = await client.api.v4.movies[":movie"].$get({
    param: { movie: key },
  });
  const response = await res.json();
  if (!res.ok && (res.status as number) !== 404) {
    throw new Error("Failed to fetch movie");
  }
  return response;
};

export const useMovie = (query?: string) => {
  // Playback URLs embed a token that expires after 6+ hours; refetching well
  // before that hands a long-running player a fresh URL (SWR keeps the old
  // data object while the response is unchanged, so nothing reloads until
  // the token actually rotates).
  return useStickySWR(query, fetcher, {
    refreshInterval: 30 * 60 * 1000,
    refreshWhenHidden: true,
  });
};
