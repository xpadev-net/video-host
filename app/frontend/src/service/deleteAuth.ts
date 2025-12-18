import { AuthTokenLocalStorageKey } from "@/atoms/Auth";
import { client } from "@/lib/client";

export const deleteAuth = async () => {
  const storedToken =
    typeof window !== "undefined"
      ? localStorage.getItem(AuthTokenLocalStorageKey)
      : null;
  const token = storedToken
    ? storedToken.startsWith('"')
      ? storedToken.slice(1, -1)
      : storedToken
    : "";

  if (!token) return { status: "error", message: "No token found" };

  const res = await client.api.v4.auth.$delete({
    json: { token },
  });
  return await res.json();
};
