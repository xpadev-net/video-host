import { VOD_BASE_URL, TEMP_DIR, MIN_DISK_SPACE_GB, JOB_TIMEOUT_SECONDS } from "./env";
import {
  getEncodeJobBlocking,
  closeRedis,
  type EncodeJob,
  setEncodeProgress,
  addJobToRetryQueue,
  processRetryQueue,
} from "./queue";
import { downloadFromTmp, uploadToProd, deleteFromTmp } from "./s3";
import { encodeVideo, getLocalPath, cleanup } from "./encoder";
import { sendCallback } from "./callback";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

console.log("FFmpeg Worker starting...");
console.log(`Commit Hash: ${process.env.COMMIT_HASH || "unknown"}`);

let isShuttingDown = false;

const checkDiskSpace = async (): Promise<boolean> => {
  try {
    // Use df command to check available disk space
    // df -BG outputs in GB, -B1 outputs in bytes (more reliable)
    const { stdout } = await execAsync(`df -B1 ${TEMP_DIR}`);
    const lines = stdout.trim().split("\n");
    if (lines.length < 2) {
      console.warn("Could not parse df output, assuming disk space is available");
      return true;
    }

    // Parse the output: Filesystem 1K-blocks Used Available Use% Mounted on
    // or: Filesystem 1B-blocks Used Available Use% Mounted on
    const parts = lines[1].trim().split(/\s+/);
    if (parts.length < 4) {
      console.warn("Could not parse df output, assuming disk space is available");
      return true;
    }

    // Available space in bytes (3rd column when using -B1)
    const availableBytes = parseInt(parts[3], 10);
    if (isNaN(availableBytes)) {
      console.warn("Could not parse available disk space, assuming disk space is available");
      return true;
    }

    const availableGB = availableBytes / (1024 * 1024 * 1024);
    const hasEnoughSpace = availableGB >= MIN_DISK_SPACE_GB;

    if (!hasEnoughSpace) {
      console.warn(
        `Insufficient disk space: ${availableGB.toFixed(2)}GB available, ${MIN_DISK_SPACE_GB}GB required`,
      );
    }

    return hasEnoughSpace;
  } catch (error) {
    console.error("Error checking disk space:", error);
    // On error, assume disk space is available to avoid blocking jobs
    // This is a fail-open approach
    return true;
  }
};

const processJob = async (job: EncodeJob): Promise<void> => {
  console.log(`Processing job: movieId=${job.movieId}, s3Key=${job.s3Key}`);

  // Check disk space before processing
  const hasEnoughSpace = await checkDiskSpace();
  if (!hasEnoughSpace) {
    console.error(
      `Insufficient disk space for job: movieId=${job.movieId}, scheduling retry`,
    );
    // Schedule retry for later
    const retryCount = job.retryCount || 0;
    if (retryCount < 3) {
      await addJobToRetryQueue(job);
      await setEncodeProgress(job.movieId, {
        status: "retrying",
      });
    } else {
      await setEncodeProgress(job.movieId, {
        status: "failed",
      });
      await sendCallback({
        movieId: job.movieId,
        variantId: "original",
        status: "failed",
      });
    }
    return;
  }

  // Set status to processing
  await setEncodeProgress(job.movieId, { status: "processing", progress: 0 });

  const inputPath = getLocalPath(job.s3Key, "_input");
  const outputPath = getLocalPath(job.s3Key, "_output.mp4");
  const filesToCleanup = [inputPath, outputPath];

  // Create abort controller for timeout management
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    console.error(
      `Job timeout after ${JOB_TIMEOUT_SECONDS} seconds: movieId=${job.movieId}`,
    );
    abortController.abort();
  }, JOB_TIMEOUT_SECONDS * 1000);

  try {
    // Download from tmp-bucket
    console.log(`Downloading from tmp-bucket: ${job.s3Key}`);
    await downloadFromTmp(job.s3Key, inputPath, abortController.signal);

    // Encode video with progress callback and abort signal
    console.log(`Encoding video to: ${outputPath}`);
    const result = await encodeVideo(
      inputPath,
      outputPath,
      async (progress) => {
        // Update progress in Redis
        await setEncodeProgress(job.movieId, {
          status: "processing",
          progress: progress.percent,
          currentTime: progress.currentTime,
          duration: progress.duration,
        });
      },
      abortController.signal,
    );

    if (!result.success) {
      console.error(`Encoding failed: ${result.error}`);
      // Try to retry the job
      const retryCount = job.retryCount || 0;
      if (retryCount < 3) {
        console.log(
          `Scheduling retry for job: movieId=${job.movieId}, retryCount=${retryCount + 1}`,
        );
        await addJobToRetryQueue(job);
        await setEncodeProgress(job.movieId, {
          status: "retrying",
        });
        // Don't send callback yet, wait for final retry
        return;
      } else {
        // Max retries exceeded
        await setEncodeProgress(job.movieId, { status: "failed" });
        await sendCallback({
          movieId: job.movieId,
          variantId: "original",
          status: "failed",
        });
        return;
      }
    }

    // Upload to prod-bucket (same key structure)
    console.log(`Uploading to prod-bucket: ${job.s3Key}`);
    await uploadToProd(job.s3Key, outputPath, "video/mp4", abortController.signal);

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
    // Try to retry the job
    const retryCount = job.retryCount || 0;
    if (retryCount < 3) {
      console.log(
        `Scheduling retry for job: movieId=${job.movieId}, retryCount=${retryCount + 1}`,
      );
      await addJobToRetryQueue(job);
      await setEncodeProgress(job.movieId, {
        status: "retrying",
      });
      // Don't send callback yet, wait for final retry
    } else {
      // Max retries exceeded
      await setEncodeProgress(job.movieId, { status: "failed" });
      await sendCallback({
        movieId: job.movieId,
        variantId: "original",
        status: "failed",
      });
    }
  } finally {
    // Clear timeout if job completed before timeout
    clearTimeout(timeoutId);
    cleanup(filesToCleanup);
  }
};

const pollForJobs = async (): Promise<void> => {
  // Process retry queue periodically (every 10 seconds)
  const retryQueueInterval = setInterval(async () => {
    if (!isShuttingDown) {
      try {
        await processRetryQueue();
      } catch (error) {
        console.error("Error processing retry queue:", error);
      }
    } else {
      clearInterval(retryQueueInterval);
    }
  }, 10000);

  // Process retry queue once at startup
  try {
    await processRetryQueue();
  } catch (error) {
    console.error("Error processing retry queue at startup:", error);
  }

  while (!isShuttingDown) {
    try {
      // Use blocking pop with 5 second timeout
      const job = await getEncodeJobBlocking(5);
      if (job) {
        await processJob(job);
      }
      // If no job, brPop will timeout and return null, then loop continues
    } catch (error) {
      console.error("Error polling for jobs:", error);
      // On error, wait a bit before retrying to avoid tight error loop
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  clearInterval(retryQueueInterval);
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
