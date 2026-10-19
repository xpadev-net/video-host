import type { FilteredUser } from "@video-host/backend";
import { useAtomValue } from "jotai";
import useSWR from "swr";
import { selectedProfileIdAtom } from "@/atoms/SelectedAccount";
import { useStickySWR } from "@/hooks/useStickySWR";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/client";

type UserNotFoundResponse = {
  status: "error";
  code: 404;
  message: string;
};

const fetcher = async ([key]: readonly [string, string | null]) => {
  const res =
    key === "me"
      ? await client.api.v4.users.me.$get()
      : await client.api.v4.users[":user"].$get({ param: { user: key } });

  if (!res.ok) {
    if ((res.status as number) !== 404) {
      throw new Error("Failed to fetch user");
    }
    return (await res.json()) as unknown as UserNotFoundResponse;
  }

  const response = await res.json();
  return response;
};

export const useUser = (query?: string) => {
  const selectedProfileId = useAtomValue(selectedProfileIdAtom);
  return useStickySWR(
    query ? ([query, selectedProfileId] as const) : null,
    fetcher,
    {},
  );
};

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
