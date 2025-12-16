import { useAtomValue } from "jotai";
import useSWR from "swr";
import type { FilteredMovie, PaginatedResponse } from "@/@types/v4Api";
import { AuthTokenAtom } from "@/atoms/Auth";
import { selectedAccountIdAtom } from "@/atoms/SelectedAccount";

const API_URL = process.env.NEXT_PUBLIC_API_ENDPOINT || "";

const fetcher = async (url: string, token: string | null) => {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Failed to fetch");
  const json = await res.json();
  return json.data;
};

export const useMyMovies = (page = 1, limit = 20) => {
  const token = useAtomValue(AuthTokenAtom);
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);

  // If system account is selected, filter by author; otherwise use mine=true
  const queryParams = selectedAccountId
    ? `author=${selectedAccountId}&page=${page}&limit=${limit}`
    : `mine=true&page=${page}&limit=${limit}`;

  return useSWR<PaginatedResponse<FilteredMovie>>(
    token ? [`${API_URL}movies?${queryParams}`, token] : null,
    ([url, t]) => fetcher(url, t as string),
    {
      revalidateOnFocus: false,
    },
  );
};

export const useMySeries = (page = 1, limit = 20) => {
  const token = useAtomValue(AuthTokenAtom);
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);

  const queryParams = selectedAccountId
    ? `author=${selectedAccountId}&page=${page}&limit=${limit}`
    : `mine=true&page=${page}&limit=${limit}`;

  return useSWR(
    token ? [`${API_URL}series?${queryParams}`, token] : null,
    ([url, t]) => fetcher(url, t as string),
    {
      revalidateOnFocus: false,
    },
  );
};

export const useMyPlaylists = (page = 1, limit = 20) => {
  const token = useAtomValue(AuthTokenAtom);
  const selectedAccountId = useAtomValue(selectedAccountIdAtom);

  const queryParams = selectedAccountId
    ? `author=${selectedAccountId}&page=${page}&limit=${limit}`
    : `mine=true&page=${page}&limit=${limit}`;

  return useSWR(
    token ? [`${API_URL}playlists?${queryParams}`, token] : null,
    ([url, t]) => fetcher(url, t as string),
    {
      revalidateOnFocus: false,
    },
  );
};

export const useSystemAccounts = () => {
  const token = useAtomValue(AuthTokenAtom);

  return useSWR(
    token ? [`${API_URL}system-accounts`, token] : null,
    ([url, t]) => fetcher(url, t as string),
    {
      revalidateOnFocus: false,
    },
  );
};
