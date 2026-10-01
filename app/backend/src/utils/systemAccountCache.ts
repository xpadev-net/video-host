import { prisma } from "@/lib/prisma";

/**
 * Check if a user is a system account.
 * System authors are explicitly classified and never inferred from credentials.
 */
export async function isSystemAccount(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { kind: true },
  });
  return user?.kind === "SYSTEM";
}
