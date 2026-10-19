import { createHash } from "node:crypto";
import { Prisma, type User } from "@prisma/client";
import { safeAvatarUrl } from "@/lib/auth-policy";
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

/**
 * Never claim an existing domain account by mutable name, email or legacy SSO ID.
 * Runs on every authenticated request, so the common case is a plain read; the
 * row is only created the first time an identity is seen.
 */
export async function provisionAuthProfile(
  identity: AuthIdentity,
): Promise<User> {
  const existing = await prisma.user.findUnique({
    where: { authUserId: identity.id },
  });
  if (existing) return existing;
  try {
    return await prisma.user.create({
      data: {
        authUserId: identity.id,
        kind: "HUMAN",
        username: profileUsername(identity),
        name: (identity.name || identity.email.split("@")[0] || "User").slice(
          0,
          191,
        ),
        avatarUrl: safeAvatarUrl(identity.image),
        role: "USER",
      },
    });
  } catch (error) {
    // A concurrent first request created the row between our read and create.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const created = await prisma.user.findUnique({
        where: { authUserId: identity.id },
      });
      if (created) return created;
    }
    throw error;
  }
}
