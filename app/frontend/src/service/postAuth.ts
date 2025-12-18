import { client } from "@/lib/client";

export const postAuth = async (username: string, password: string) => {
  const res = await client.api.v4.auth.$post({
    json: {
      username,
      password,
      type: "password",
    },
  });

  return res;
};
