import type { InferResponseType } from "hono/client";

import { client } from "@/lib/client";

type AuthApiType = typeof client.api.v4.auth.$post;
export type AuthResponse = InferResponseType<AuthApiType>;

export const postAuth = async (
  username: string,
  password: string,
): Promise<AuthResponse> => {
  const res = await client.api.v4.auth.$post({
    json: {
      username,
      password,
      type: "password",
    },
  });

  return res.json();
};
