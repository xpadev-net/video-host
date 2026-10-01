import { useAtomValue } from "jotai";
import useSWR from "swr";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/client";

export const useMyMovies = (page = 1, limit = 20) => {
  const { data: authSession } = authClient.useSession();
  const session = authSession?.user.id;
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);

  return useSWR(
    session ? ["movies", page, limit, selectedAccountId, session] : null,
    async ([_, p, l, account]) => {
      const res = await client.api.v4.movies.$get({
        query: {
          page: p.toString(),
          limit: l.toString(),
          author: account || undefined,
          mine: account ? undefined : "true",
        },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      return json.data;
    },
    {
      revalidateOnFocus: false,
    },
  );
};

export const useMySeries = (page = 1, limit = 20) => {
  const { data: authSession } = authClient.useSession();
  const session = authSession?.user.id;
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);

  return useSWR(
    session ? ["series", page, limit, selectedAccountId, session] : null,
    async ([_, p, l, account]) => {
      const res = await client.api.v4.series.$get({
        query: {
          page: p.toString(),
          limit: l.toString(),
          author: account || undefined,
          mine: account ? undefined : "true",
        },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      return json.data;
    },
    {
      revalidateOnFocus: false,
    },
  );
};

export const useMyPlaylists = (page = 1, limit = 20) => {
  const { data: authSession } = authClient.useSession();
  const session = authSession?.user.id;
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);

  return useSWR(
    session ? ["playlists", page, limit, selectedAccountId, session] : null,
    async ([_, p, l, account]) => {
      const res = await client.api.v4.playlists.$get({
        query: {
          page: p.toString(),
          limit: l.toString(),
          author: account || undefined,
          mine: account ? undefined : "true",
        },
      });
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      return json.data;
    },
    {
      revalidateOnFocus: false,
    },
  );
};

export const useSystemAccounts = () => {
  const { data: authSession } = authClient.useSession();
  const session = authSession?.user.id;

  return useSWR(
    session ? ["system-accounts", session] : null,
    async () => {
      const res = await client.api.v4["system-accounts"].$get();
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      return json.data;
    },
    {
      revalidateOnFocus: false,
    },
  );
};
