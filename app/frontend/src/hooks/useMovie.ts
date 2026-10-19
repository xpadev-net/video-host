import { useStickySWR } from "@/hooks/useStickySWR";

import { client } from "@/lib/client";

const fetcher = async (key?: string) => {
  if (!key)
    return Promise.resolve({
      status: "error" as const,
      code: 404,
      message: "not found",
    });
  const res = await client.api.v4.movies[":movie"].$get({
    param: { movie: key },
  });
  return await res.json();
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
