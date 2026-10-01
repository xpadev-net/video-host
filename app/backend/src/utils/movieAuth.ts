import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, unauthorized } from "@/utils/response";
import { isSystemAccount } from "@/utils/systemAccountCache";

// Admins may act on behalf of a system account (a user row explicitly marked SYSTEM).
// Mirrors the asUserId handling used when creating movies.
export const resolveAuthorId = async (
  user: User,
  asUserId?: string,
): Promise<string> => {
  if (!asUserId) {
    return user.id;
  }
  if (user.role !== "ADMIN") {
    unauthorized("Only admins can post as other users");
  }
  const targetUser = await prisma.user.findUnique({
    where: { id: asUserId },
  });
  if (!targetUser || targetUser.kind !== "SYSTEM") {
    badRequest("Target user must be a system account");
  }
  return asUserId;
};

export const canManageMovie = async (
  user: User,
  authorId: string,
): Promise<boolean> => {
  if (user.id === authorId) {
    return true;
  }
  return user.role === "ADMIN" && (await isSystemAccount(authorId));
};
