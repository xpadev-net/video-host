import { useAtomValue } from "jotai";
import useSWR from "swr";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
} from "@/atoms/SelectedAccount";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/client";

export const useInvitations = () => {
  const { data: authSession } = authClient.useSession();
  const session = authSession?.user.id;
  const accountId = useAtomValue(selectedAccountIdAtom);
  const profileId = useAtomValue(selectedProfileIdAtom);

  return useSWR(
    session && profileId
      ? (["invitations", session, accountId, profileId] as const)
      : null,
    async ([, , account, profile]) => {
      const res = await client.api.v4.invitations.$get(
        {},
        {
          headers: { "X-Account-Id": account ?? "", "X-Profile-Id": profile },
        },
      );
      if (!res.ok) throw new Error("Failed to fetch invitations");
      const json = await res.json();
      return json.data;
    },
    { revalidateOnFocus: false, keepPreviousData: false },
  );
};
