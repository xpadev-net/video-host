import useSWR from "swr";
import { useStickySWR } from "@/hooks/useStickySWR";
import { authClient } from "@/lib/auth-client";
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

  return await res.json();
};

export const useUser = (query?: string) => useStickySWR(query, fetcher, {});

export const useSelf = () => {
  const { data: session, isPending } = authClient.useSession();
  // Better Auth identifies the login; domain profile, roles and system-account
  // permissions must continue to come from the application API.
  const swr = useSWR(session ? ["self", session.user.id] : null, () =>
    fetcher("me"),
  );
  return {
    ...swr,
    data: session ? swr.data : undefined,
    isLoading: isPending || (Boolean(session) && swr.isLoading),
  };
};
