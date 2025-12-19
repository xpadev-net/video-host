import { AuthTokenLocalStorageKey } from "@/atoms/Auth";
import { ApiEndpoint } from "@/contexts/env";

const request = async <T>(url: string, option: RequestInit = {}) => {
  const storedToken =
    typeof window !== "undefined"
      ? localStorage.getItem(AuthTokenLocalStorageKey)
      : null;
  const token = storedToken
    ? storedToken.startsWith('"')
      ? storedToken.slice(1, -1)
      : storedToken
    : null;

  const headers = new Headers(option.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const req = await fetch(`${ApiEndpoint}${url}`, {
    ...option,
    method: "POST",
    mode: "cors",
    headers,
  });
  return (await req.json()) as T;
};

export { request };
