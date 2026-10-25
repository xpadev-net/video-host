import type { User } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, notFound } from "@/utils/response";
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
    forbidden("Only admins can post as other users");
  }
  const targetUser = await prisma.user.findUnique({
    where: { id: asUserId },
  });
  if (targetUser?.kind !== "SYSTEM") {
    badRequest("Target user must be a system account");
  }
  return asUserId;
};

export const canManageOwned = async (
  user: User,
  authorId: string,
): Promise<boolean> => {
  if (user.id === authorId) {
    return true;
  }
  return user.role === "ADMIN" && (await isSystemAccount(authorId));
};

// Rejects (404 when missing, 401 when not manageable) before a movie is
// attached to a series, so nobody can inject movies into another user's series.
export const assertCanManageSeries = async (
  user: User,
  seriesId: string,
): Promise<void> => {
  const series = await prisma.series.findUnique({
    where: { id: seriesId },
    select: { authorId: true },
  });
  if (!series) {
    notFound("Series not found");
  }
  if (!(await canManageOwned(user, series.authorId))) {
    forbidden("Not authorized to edit this series");
  }
};
