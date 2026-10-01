import { createHash } from "node:crypto";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export interface AuthIdentity {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

export function profileUsername(identity: AuthIdentity): string {
  const base =
    (identity.name || identity.email.split("@")[0] || "user")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 15) || "user";
  const suffix = createHash("sha256")
    .update(identity.id)
    .digest("hex")
    .slice(0, 16);
  return `${base}_${suffix}`;
}

/** Never claim an existing domain account by mutable name, email or legacy SSO ID. */
export async function provisionAuthProfile(
  identity: AuthIdentity,
): Promise<User> {
  return prisma.user.upsert({
    where: { authUserId: identity.id },
    update: {},
    create: {
      authUserId: identity.id,
      kind: "HUMAN",
      username: profileUsername(identity),
      name: (identity.name || identity.email.split("@")[0] || "User").slice(
        0,
        191,
      ),
      avatarUrl:
        identity.image && identity.image.length <= 191 ? identity.image : null,
      role: "USER",
    },
  });
}
