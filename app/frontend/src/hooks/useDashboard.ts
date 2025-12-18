import { useAtomValue } from "jotai";
import useSWR from "swr";
import { AuthTokenAtom } from "@/atoms/Auth";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";
import { client } from "@/lib/client";

export const useMyMovies = (page = 1, limit = 20) => {
  const token = useAtomValue(AuthTokenAtom);
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);

  return useSWR(
    token ? ["movies", page, limit, selectedAccountId] : null,
    async ([_, p, l, account]) => {
      const res = await client.api.v4.movies.$get(
        {
          query: {
            page: p.toString(),
            limit: l.toString(),
            author: account || undefined,
            mine: account ? undefined : "true",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
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
  const token = useAtomValue(AuthTokenAtom);
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);

  return useSWR(
    token ? ["series", page, limit, selectedAccountId] : null,
    async ([_, p, l, account]) => {
      const res = await client.api.v4.series.$get(
        {
          query: {
            page: p.toString(),
            limit: l.toString(),
            author: account || undefined,
            mine: account ? undefined : "true",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
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
  const token = useAtomValue(AuthTokenAtom);
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);

  return useSWR(
    token ? ["playlists", page, limit, selectedAccountId] : null,
    async ([_, p, l, account]) => {
      const res = await client.api.v4.playlists.$get(
        {
          query: {
            page: p.toString(),
            limit: l.toString(),
            author: account || undefined,
            mine: account ? undefined : "true",
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
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
  const token = useAtomValue(AuthTokenAtom);

  return useSWR(
    token ? ["system-accounts"] : null,
    async () => {
      const res = await client.api.v4["system-accounts"].$get(
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      return json.data;
    },
    {
      revalidateOnFocus: false,
    },
  );
};
