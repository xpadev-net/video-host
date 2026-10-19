import type { FilteredUser } from "@video-host/backend";
import useSWR from "swr";
import { useStickySWR } from "@/hooks/useStickySWR";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/client";

const fetcher = async (key: string) => {
  const res =
    key === "me"
      ? await client.api.v4.users.me.$get()
      : await client.api.v4.users[":user"].$get({ param: { user: key } });

  const response = await res.json();
  if (!res.ok && (res.status as number) !== 404) {
    throw new Error("Failed to fetch user");
  }
  return response;
};

export const useUser = (query?: string) => useStickySWR(query, fetcher, {});

export const useSelf = () => {
  const { data: session, isPending } = authClient.useSession();
  // Better Auth identifies the login; domain profile, roles and system-account
  // permissions must continue to come from the application API.
  const swr = useSWR<FilteredUser | null>(
    session ? ["self", session.user.id] : null,
    async () => {
      const response = await client.api.v4.users.me.$get();
      const result = await response.json();
      return result.status === "ok" ? result.data : null;
    },
  );
  return {
    ...swr,
    data: session ? (swr.data ?? null) : null,
    isLoading: isPending || (Boolean(session) && swr.isLoading),
  };
};
