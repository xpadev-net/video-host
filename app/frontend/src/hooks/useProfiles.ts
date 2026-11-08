import { useAtomValue } from "jotai";
import useSWR from "swr";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/client";

export const useProfiles = () => {
  const { data: authSession } = authClient.useSession();
  const session = authSession?.user.id;

  const accountId = useAtomValue(selectedAccountIdAtom);
  return useSWR(
    session ? ["profiles", session, accountId] : null,
    async () => {
      const response = await client.api.v4.users.profiles.$get(
        {
          query: { accountId: accountId ?? undefined },
        },
        { headers: { "X-Profile-Id": "", "X-Account-Id": "" } },
      );
      if (!response.ok) throw new Error("Failed to fetch profiles");
      const result = await response.json();
      return result.data;
    },
    { revalidateOnFocus: false },
  );
};
