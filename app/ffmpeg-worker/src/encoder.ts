import { spawn } from "child_process";
import { mkdirSync, existsSync, rmSync, statSync } from "fs";
import { join, dirname } from "path";
import { TEMP_DIR, FFMPEG_THREADS } from "./env";

export interface EncodeResult {
  success: boolean;
  outputPath?: string;
  duration?: number;
  error?: string;
}

export interface ProgressCallback {
  (progress: { currentTime: number; duration: number; percent: number }): void;
}

// Ensure temp directory exists
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true });
}

// Get input file duration before encoding
const getInputDuration = async (inputPath: string): Promise<number> => {
  return new Promise((resolve) => {
    const ffprobe = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      inputPath,
    ]);

    let stdout = "";
    ffprobe.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    ffprobe.on("close", (code) => {
      if (code === 0) {
        const duration = parseFloat(stdout.trim());
        resolve(isNaN(duration) ? 0 : duration);
      } else {
        resolve(0);
      }
    });

    ffprobe.on("error", () => {
      resolve(0);
    });
  });
};

// Parse time=HH:MM:SS.XX from ffmpeg stderr
const parseTimeFromStderr = (line: string): number | null => {
  const match = line.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const seconds = parseInt(match[3], 10);
    const centiseconds = parseInt(match[4], 10);
    return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
  }
  return null;
};

export const encodeVideo = async (
  inputPath: string,
  outputPath: string,
  onProgress?: ProgressCallback,
  abortSignal?: AbortSignal,
): Promise<EncodeResult> => {
  // Check if already aborted before starting (e.g., timeout during download)
  if (abortSignal?.aborted) {
    return {
      success: false,
      error: "Encoding aborted before start (timeout during download)",
    };
  }

  // Get input duration for progress calculation
  const inputDuration = await getInputDuration(inputPath);

  // Check again after async operation (abort may have occurred during getInputDuration)
  if (abortSignal?.aborted) {
    return {
      success: false,
      error: "Encoding aborted before start (timeout during download)",
    };
  }

  return new Promise((resolve) => {
    // Ensure output directory exists
    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // FFmpeg command for re-encoding to mp4
    const ffmpegArgs = [
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "23",
    ];

    // Add thread limit if specified
    if (FFMPEG_THREADS !== undefined) {
      ffmpegArgs.push("-threads", FFMPEG_THREADS.toString());
    }

    ffmpegArgs.push(
      "-c:a",
      "aac",
      "-ac",
      "2",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-progress",
      "pipe:2", // Output progress to stderr
      "-y",
      outputPath,
    );

    console.log(`Starting encode: ffmpeg ${ffmpegArgs.join(" ")}`);

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    // Check if already aborted after spawning (race condition check)
    if (abortSignal?.aborted) {
      console.log("Encoding aborted immediately after spawn (timeout during download)");
      ffmpeg.kill("SIGTERM");
      // Force kill after short delay
      setTimeout(() => {
        if (ffmpeg.exitCode === null && ffmpeg.signalCode === null) {
          ffmpeg.kill("SIGKILL");
        }
      }, 1000);
      resolve({
        success: false,
        error: "Encoding aborted before start (timeout during download)",
      });
      return;
    }

    // Handle abort signal
    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        console.log("Encoding aborted due to timeout or cancellation");
        // Check if process is still running (exitCode and signalCode are null)
        if (ffmpeg.exitCode === null && ffmpeg.signalCode === null) {
          ffmpeg.kill("SIGTERM");
          // Force kill after 5 seconds if still running
          // Use exitCode/signalCode instead of killed, as killed becomes true
          // immediately after kill() is called, not when the process actually exits
          const killTimeout = setTimeout(() => {
            // Check if process is still running (not terminated)
            if (ffmpeg.exitCode === null && ffmpeg.signalCode === null) {
              console.log("Force killing FFmpeg process (SIGTERM ignored)");
              ffmpeg.kill("SIGKILL");
            }
          }, 5000);
          // Clear timeout if process exits before SIGKILL
          ffmpeg.once("close", () => {
            clearTimeout(killTimeout);
          });
        }
      });
    }

    let stderr = "";
    ffmpeg.stderr.on("data", (data) => {
      const line = data.toString();
      stderr += line;

      // Parse progress if callback provided and we have duration
      if (onProgress && inputDuration > 0) {
        const currentTime = parseTimeFromStderr(line);
        if (currentTime !== null) {
          const percent = Math.min(100, Math.round((currentTime / inputDuration) * 100));
          onProgress({
            currentTime: Math.round(currentTime),
            duration: Math.round(inputDuration),
            percent,
          });
        }
      }
    });

    ffmpeg.on("close", (code) => {
      // Check if aborted
      if (abortSignal?.aborted) {
        resolve({
          success: false,
          error: "Encoding aborted due to timeout",
        });
        return;
      }

      if (code === 0 && existsSync(outputPath)) {
        // Get duration from ffprobe
        getDuration(outputPath).then((duration) => {
          resolve({
            success: true,
            outputPath,
            duration,
          });
        });
      } else {
        resolve({
          success: false,
          error: `FFmpeg exited with code ${code}: ${stderr.slice(-500)}`,
        });
      }
    });

    ffmpeg.on("error", (err) => {
      resolve({
        success: false,
        error: `Failed to start FFmpeg: ${err.message}`,
      });
    });
  });
};

const getDuration = async (filePath: string): Promise<number> => {
  return new Promise((resolve) => {
    const ffprobe = spawn("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);

    let stdout = "";
    ffprobe.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    ffprobe.on("close", (code) => {
      if (code === 0) {
        const duration = parseFloat(stdout.trim());
        resolve(isNaN(duration) ? 0 : Math.round(duration));
      } else {
        resolve(0);
      }
    });

    ffprobe.on("error", () => {
      resolve(0);
    });
  });
};

const sanitizeFilename = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 255);
};

export const getLocalPath = (s3Key: string, suffix: string): string => {
  const filename = s3Key.split("/").pop() || "video";
  const sanitized = sanitizeFilename(filename);
  return join(TEMP_DIR, `${sanitized}_${Date.now()}${suffix}`);
};

export const cleanup = (paths: string[]): void => {
  for (const path of paths) {
    try {
      if (existsSync(path)) {
        rmSync(path, { force: true });
      }
    } catch (e) {
      console.error(`Failed to cleanup ${path}:`, e);
    }
  }
};
