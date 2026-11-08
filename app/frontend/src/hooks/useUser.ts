import type { FilteredUser } from "@video-host/backend";
import { useAtomValue } from "jotai";
import { useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
} from "@/atoms/SelectedAccount";
import { useStickySWR } from "@/hooks/useStickySWR";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/client";

type UserNotFoundResponse = {
  status: "error";
  code: 404;
  message: string;
};

const fetcher = async ([key, profileId]: readonly [string, string | null]) => {
  const res =
    key === "me"
      ? await client.api.v4.users.me.$get(
          {},
          { headers: { "X-Profile-Id": profileId ?? "" } },
        )
      : await client.api.v4.users[":user"].$get(
          { param: { user: key } },
          { headers: { "X-Profile-Id": profileId ?? "" } },
        );

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
  const selectedProfileId = useAtomValue(selectedProfileIdAtom);
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const { mutate: revalidate } = useSWRConfig();
  const sessionId = session?.user.id;
  // The API resolves account permissions and the selected profile.
  const swr = useSWR<FilteredUser | null>(
    session && selectedProfileId
      ? ([
          "self",
          session.user.id,
          selectedProfileId,
          selectedAccountId,
        ] as const)
      : null,
    async ([, , profileId, accountId]: readonly [
      string,
      string,
      string | null,
      string | null,
    ]) => {
      const response = await client.api.v4.users.me.$get(
        {},
        {
          headers: {
            "X-Profile-Id": profileId ?? "",
            "X-Account-Id": accountId ?? "",
          },
        },
      );
      if ((response.status as number) === 403) {
        throw new InvalidProfileSelection(
          "Profile selection is no longer valid",
        );
      }
      const result = await response.json();
      return result.status === "ok" ? result.data : null;
    },
    {
      shouldRetryOnError: (error: Error) =>
        !(error instanceof InvalidProfileSelection),
    },
  );
  useEffect(() => {
    if (!(swr.error instanceof InvalidProfileSelection) || !sessionId) return;
    // Only the currently observed request can trigger revalidation. Late
    // responses for an old SWR key cannot erase a newer device selection.
    // The selection gate confirms membership before clearing an unknown ID.
    void Promise.allSettled([
      revalidate(["profiles", sessionId, selectedAccountId]),
      revalidate(["account", sessionId]),
    ]);
  }, [swr.error, sessionId, selectedAccountId, revalidate]);
  return {
    ...swr,
    data: session ? (swr.data ?? null) : null,
    isLoading: isPending || (Boolean(session) && swr.isLoading),
  };
};

class InvalidProfileSelection extends Error {}
