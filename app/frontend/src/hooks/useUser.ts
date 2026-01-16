import type { InferResponseType } from "hono";
import { useAtom } from "jotai";
import { useEffect } from "react";
import { AuthTokenAtom } from "@/atoms/Auth";
import { useStickySWR } from "@/hooks/useStickySWR";
import { client } from "@/lib/client";

type UserApiType = typeof client.api.v4.users[":user"].$get;
export type UserResponse = InferResponseType<UserApiType>;

type MeApiType = typeof client.api.v4.users.me.$get;
export type MeResponse = InferResponseType<MeApiType>;

const fetchUser = async (key?: string): Promise<UserResponse> => {
  if (!key) {
    return {
      status: "error",
      code: 404,
      message: "not found",
    };
  }

  const res = await client.api.v4.users[":user"].$get({
    param: { user: key },
  });

  return await res.json();
};

const fetchSelf = async (): Promise<MeResponse> => {
  const res = await client.api.v4.users.me.$get();
  return await res.json();
};

export const useUser = (query?: string) => {
  return useStickySWR<UserResponse>(query, fetchUser, {});
};

export const useSelf = () => {
  const swr = useStickySWR<MeResponse>("me", fetchSelf, {});
  const [token, setToken] = useAtom(AuthTokenAtom);
  useEffect(() => {
    void swr.mutate();
  }, [swr.mutate]);

  useEffect(() => {
    if (swr.data && swr.data.code === 401 && token) {
      setToken(null);
      location.reload();
    }
    if (swr.data?.status === "ok" && swr.data.data === null && token) {
      setToken(null);
      location.reload();
    }
  }, [swr.data, setToken, token]);

  return swr;
};
