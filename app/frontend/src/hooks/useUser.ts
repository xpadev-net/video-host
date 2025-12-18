import { useAtom } from "jotai";
import { useEffect } from "react";
import { AuthTokenAtom, AuthTokenLocalStorageKey } from "@/atoms/Auth";
import { useStickySWR } from "@/hooks/useStickySWR";
import { client } from "@/lib/client";

const fetcher = async (key?: string) => {
  if (!key)
    return {
      status: "error",
      code: 404,
      message: "not found",
    };

  const storedToken =
    typeof window !== "undefined"
      ? localStorage.getItem(AuthTokenLocalStorageKey)
      : null;
  // Previously requests.ts sliced the token (likely due to JSON.stringify storage).
  // We mimic this: `token.slice(1, -1)` if it starts/ends with quote?
  // Let's assume the previous logic was correct for the stored format.
  const token = storedToken
    ? storedToken.startsWith('"')
      ? storedToken.slice(1, -1)
      : storedToken
    : null;

  const headers: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};

  const res =
    key === "me"
      ? await client.api.v4.users.me.$get(undefined, { headers })
      : await client.api.v4.users[":user"].$get(
          { param: { user: key } },
          { headers },
        );

  // Always return JSON, whether ok or not, as previous code returned error body
  return await res.json();
};

export const useUser = (query?: string) => {
  return useStickySWR(query, fetcher, {});
};

export const useSelf = () => {
  const swr = useStickySWR("me", fetcher, {});
  const [token, setToken] = useAtom(AuthTokenAtom);
  useEffect(() => {
    void swr.mutate();
  }, [swr.mutate]);

  useEffect(() => {
    if (swr.data && swr.data.code === 401 && token) {
      setToken(null);
      location.reload();
    }
    // Check for success code and null data usage?
    // Using simple cast to avoid complex type guard for now given the inference issues.
    if (
      swr.data?.code === 200 &&
      (swr.data as { data: unknown }).data === null &&
      token
    ) {
      setToken(null);
      location.reload();
    }
  }, [swr.data, setToken, token]);

  return swr;
};
