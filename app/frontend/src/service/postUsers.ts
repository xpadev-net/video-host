import { client } from "@/lib/client";

export const postUsers = async (
  username: string,
  name: string,
  password: string,
  _signupCode: string,
) => {
  const res = await client.api.v4.users.$post({
    json: {
      username,
      name,
      password,
    },
  });
  return res.json();
};
