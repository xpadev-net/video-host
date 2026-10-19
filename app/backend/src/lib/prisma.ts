import { PrismaClient } from "@prisma/client";
import { DATABASE_URL } from "@/env";

export const prisma: PrismaClient = new PrismaClient({
  datasourceUrl: DATABASE_URL,
});
