import { POLL_INTERVAL_MS, VOD_BASE_URL } from "./env";
import {
  getEncodeJob,
  closeRedis,
  type EncodeJob,
  setEncodeProgress,
} from "./queue";
import { downloadFromTmp, uploadToProd, deleteFromTmp } from "./s3";
import { encodeVideo, getLocalPath, cleanup } from "./encoder";
import { sendCallback } from "./callback";

console.log("FFmpeg Worker starting...");
console.log(`Commit Hash: ${process.env.COMMIT_HASH || "unknown"}`);

let isShuttingDown = false;

const processJob = async (job: EncodeJob): Promise<void> => {
  console.log(`Processing job: movieId=${job.movieId}, s3Key=${job.s3Key}`);

  // Set status to processing
  await setEncodeProgress(job.movieId, { status: "processing", progress: 0 });

  const inputPath = getLocalPath(job.s3Key, "_input");
  const outputPath = getLocalPath(job.s3Key, "_output.mp4");
  const filesToCleanup = [inputPath, outputPath];

  try {
    // Download from tmp-bucket
    console.log(`Downloading from tmp-bucket: ${job.s3Key}`);
    await downloadFromTmp(job.s3Key, inputPath);

    // Encode video with progress callback
    console.log(`Encoding video to: ${outputPath}`);
    const result = await encodeVideo(inputPath, outputPath, async (progress) => {
      // Update progress in Redis
      await setEncodeProgress(job.movieId, {
        status: "processing",
        progress: progress.percent,
        currentTime: progress.currentTime,
        duration: progress.duration,
      });
    });

    if (!result.success) {
      console.error(`Encoding failed: ${result.error}`);
      await setEncodeProgress(job.movieId, { status: "failed" });
      await sendCallback({
        movieId: job.movieId,
        variantId: "original",
        status: "failed",
      });
      return;
    }

    // Upload to prod-bucket (same key structure)
    console.log(`Uploading to prod-bucket: ${job.s3Key}`);
    await uploadToProd(job.s3Key, outputPath);

    // Delete from tmp-bucket
    console.log(`Deleting from tmp-bucket: ${job.s3Key}`);
    await deleteFromTmp(job.s3Key);

    // Generate content URL for VOD streaming
    const contentUrl = `${VOD_BASE_URL}/vod/${job.s3Key}/master.m3u8`;

    // Set status to completed
    await setEncodeProgress(job.movieId, { status: "completed", progress: 100 });

    // Send success callback
    await sendCallback({
      movieId: job.movieId,
      variantId: "original",
      status: "success",
      s3Key: job.s3Key,
      contentUrl,
      duration: result.duration,
    });

    console.log(`Job completed successfully: movieId=${job.movieId}`);
  } catch (error) {
    console.error(`Job failed: movieId=${job.movieId}`, error);
    await setEncodeProgress(job.movieId, { status: "failed" });
    await sendCallback({
      movieId: job.movieId,
      variantId: "original",
      status: "failed",
    });
  } finally {
    cleanup(filesToCleanup);
  }
};

const pollForJobs = async (): Promise<void> => {
  while (!isShuttingDown) {
    try {
      const job = await getEncodeJob();
      if (job) {
        await processJob(job);
      } else {
        // No job available, wait before polling again
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error) {
      console.error("Error polling for jobs:", error);
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
};

const shutdown = async (): Promise<void> => {
  console.log("Shutting down...");
  isShuttingDown = true;
  await closeRedis();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Start polling
pollForJobs().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
