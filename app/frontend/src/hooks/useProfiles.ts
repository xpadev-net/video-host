import useSWR from "swr";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/client";

export const useProfiles = () => {
  const { data: authSession } = authClient.useSession();
  const session = authSession?.user.id;

  return useSWR(
    session ? ["profiles", session] : null,
    async () => {
      const response = await client.api.v4.users.profiles.$get();
      if (!response.ok) throw new Error("Failed to fetch profiles");
      const result = await response.json();
      return result.data;
    },
    { revalidateOnFocus: false },
  );
};
