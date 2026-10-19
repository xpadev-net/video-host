import useSWR from "swr";

import { getAuthConfig } from "@/service/getAuthConfig";

export function useAuthConfig() {
  const { data, isLoading } = useSWR("public-auth-config", getAuthConfig);
  return { authConfig: data ?? null, isLoading };
}
