import { useAtom } from "jotai";
import { useEffect } from "react";
import { AuthTokenAtom } from "@/atoms/Auth";
import { useStickySWR } from "@/hooks/useStickySWR";
import { client } from "@/lib/client";

const fetcher = async (key?: string) => {
  if (!key)
    return {
      status: "error",
      code: 404,
      message: "not found",
    };

  const res =
    key === "me"
      ? await client.api.v4.users.me.$get()
      : await client.api.v4.users[":user"].$get({ param: { user: key } });

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
