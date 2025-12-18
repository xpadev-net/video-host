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
      // signupCode not in backend schema?
      // Wait, backend index.ts PostSchema: username, password, name.
      // signupCode is missing in backend schema!
      // I should update backend schema if needed or ignore it.
      // Assuming backend ignores extra fields if valid via Zod?
      // Zod strips unknown keys by default.
      // So signupCode will be stripped.
      // If it's needed for logic, I need to add it to backend schema.
      // Previous conversation didn't mention signupCode.
      // I'll leave it out of json if schema doesn't support it, or check backend implementation plan.
      // Actually backend/src/routes/api/v4/users/index.ts has PostSchema.
      // It has username, password, name.
      // No signupCode.
      // Maybe signupCode verification is done elsewhere or removed?
      // I'll include it in the call but Hono client checks types.
      // If `client` types don't have signupCode, TS will error.
      // I'll search for usages of `signupCode` in backend.
    },
  });
  return res;
};
