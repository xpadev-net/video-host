import { useAtomValue } from "jotai";
import useSWR from "swr";
import {
  selectedAccountIdAtom,
  selectedProfileIdAtom,
} from "@/atoms/SelectedAccount";
import { DashboardPageSize } from "@/constants/pagination";
import { authClient } from "@/lib/auth-client";
import { client } from "@/lib/client";

export const useMyMovies = (page = 1, limit = DashboardPageSize) => {
  const { data: authSession } = authClient.useSession();
  const session = authSession?.user.id;
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const selectedProfileId = useAtomValue(selectedProfileIdAtom);

  return useSWR(
    session
      ? ["movies", page, limit, selectedAccountId, selectedProfileId, session]
      : null,
    async ([_, p, l, account, profileId]) => {
      const res = await client.api.v4.movies.$get(
        {
          query: {
            page: p.toString(),
            limit: l.toString(),
            author: account || undefined,
            mine: account ? undefined : "true",
          },
        },
        { headers: { "X-Profile-Id": profileId ?? "" } },
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

export const useMySeries = (page = 1, limit = DashboardPageSize) => {
  const { data: authSession } = authClient.useSession();
  const session = authSession?.user.id;
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const selectedProfileId = useAtomValue(selectedProfileIdAtom);

  return useSWR(
    session
      ? ["series", page, limit, selectedAccountId, selectedProfileId, session]
      : null,
    async ([_, p, l, account, profileId]) => {
      const res = await client.api.v4.series.$get(
        {
          query: {
            page: p.toString(),
            limit: l.toString(),
            author: account || undefined,
            mine: account ? undefined : "true",
          },
        },
        { headers: { "X-Profile-Id": profileId ?? "" } },
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

export const useMyPlaylists = (page = 1, limit = DashboardPageSize) => {
  const { data: authSession } = authClient.useSession();
  const session = authSession?.user.id;
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);
  const selectedProfileId = useAtomValue(selectedProfileIdAtom);

  return useSWR(
    session
      ? [
          "playlists",
          page,
          limit,
          selectedAccountId,
          selectedProfileId,
          session,
        ]
      : null,
    async ([_, p, l, account, profileId]) => {
      const res = await client.api.v4.playlists.$get(
        {
          query: {
            page: p.toString(),
            limit: l.toString(),
            author: account || undefined,
            mine: account ? undefined : "true",
          },
        },
        { headers: { "X-Profile-Id": profileId ?? "" } },
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

export const useSystemAccounts = (enabled = true) => {
  const { data: authSession } = authClient.useSession();
  const session = authSession?.user.id;

  return useSWR(
    enabled && session ? ["system-accounts", session] : null,
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
