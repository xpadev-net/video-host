import { prisma } from "@/lib/prisma";

/**
 * Check if a user is a system account.
 * A system account is a user with password set to null.
 */
export async function isSystemAccount(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { password: true },
  });
  return user?.password === null;
}
