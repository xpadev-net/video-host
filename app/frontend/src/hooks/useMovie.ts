import type { v4GetMovieRes } from "@/@types/v4Api";
import { useStickySWR } from "@/hooks/useStickySWR";

import { client } from "@/lib/client";

const fetcher = async (key?: string): Promise<v4GetMovieRes> => {
  if (!key)
    return Promise.resolve({
      status: "error" as const,
      code: 404,
      message: "not found",
    });
  const res = await client.api.v4.movies[":movie"].$get({
    param: { movie: key },
  });
  return (await res.json()) as v4GetMovieRes;
};

export const useMovie = (query?: string) => {
  return useStickySWR(query, fetcher, {});
};
