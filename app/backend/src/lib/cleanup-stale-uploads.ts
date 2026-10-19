import { prisma } from "@/lib/prisma";
import { deleteTmpFile } from "@/lib/s3";

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const BATCH_SIZE = 100;

export const cleanupStaleUploads = async (): Promise<void> => {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await prisma.movie.findMany({
    where: {
      variants: {
        some: { status: "UPLOADING", updatedAt: { lt: cutoff } },
      },
    },
    select: {
      id: true,
      variants: {
        where: { status: "UPLOADING" },
        select: { id: true, s3Key: true, updatedAt: true },
      },
    },
    take: BATCH_SIZE,
  });

  for (const movie of stale) {
    const oldVariants = movie.variants.filter(
      (variant) => variant.updatedAt < cutoff,
    );
    if (
      oldVariants.length !== movie.variants.length ||
      oldVariants.length === 0
    ) {
      continue;
    }

    // The guarded delete prevents a concurrent /complete or retry request
    // from deleting a movie that has become active since the candidate read.
    const deleted = await prisma.movie.deleteMany({
      where: {
        id: movie.id,
        variants: {
          every: { status: "UPLOADING", updatedAt: { lt: cutoff } },
        },
      },
    });
    if (deleted.count === 0) continue;

    await Promise.all(
      oldVariants
        .filter((variant) => variant.s3Key)
        .map(async (variant) => {
          try {
            await deleteTmpFile(variant.s3Key as string);
          } catch (error) {
            console.error(
              "Failed to delete stale upload object",
              variant.id,
              error,
            );
          }
        }),
    );
  }
};

export const startStaleUploadCleanup = (): NodeJS.Timeout => {
  const timer = setInterval(() => {
    void cleanupStaleUploads().catch((error) =>
      console.error("Stale upload cleanup failed:", error),
    );
  }, CLEANUP_INTERVAL_MS);
  timer.unref();
  return timer;
};
