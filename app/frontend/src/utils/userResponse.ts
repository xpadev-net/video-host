import type { MeResponse, UserResponse } from "@/hooks/useUser";

export type OkUserResponse = Extract<
  UserResponse | MeResponse,
  { status: "ok" }
>;

export const isOkUserResponse = (
  response: UserResponse | MeResponse | undefined,
): response is OkUserResponse => response?.status === "ok";

export const getUserData = (
  response: UserResponse | MeResponse | undefined,
): OkUserResponse["data"] | null =>
  isOkUserResponse(response) ? response.data : null;
