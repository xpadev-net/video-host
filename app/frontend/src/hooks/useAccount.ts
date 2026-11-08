import useSWR from "swr";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/client";

export function useAccount() {
  const { data: session } = authClient.useSession();
  return useSWR(session ? ["account", session.user.id] : null, async () => {
    const response = await client.api.v4.accounts.me.$get(
      {},
      {
        headers: { "X-Profile-Id": "", "X-Account-Id": "" },
      },
    );
    if (!response.ok) throw new Error("Failed to fetch account");
    return (await response.json()).data;
  });
}
