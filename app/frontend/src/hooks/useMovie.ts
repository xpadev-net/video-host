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
  return useStickySWR(query, fetcher, {});
};
