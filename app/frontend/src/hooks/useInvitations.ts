import useSWR from "swr";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/client";

export const useInvitations = () => {
  const { data: authSession } = authClient.useSession();
  const session = authSession?.user.id;

  return useSWR(
    session ? ["invitations", session] : null,
    async () => {
      const res = await client.api.v4.invitations.$get();
      if (!res.ok) throw new Error("Failed to fetch invitations");
      const json = await res.json();
      return json.data;
    },
    { revalidateOnFocus: false },
  );
};
