import { spawn } from "child_process";
import { mkdirSync, existsSync, rmSync, statSync } from "fs";
import { join, dirname } from "path";
import { TEMP_DIR } from "./env";

export interface EncodeResult {
  success: boolean;
  outputPath?: string;
  duration?: number;
  error?: string;
}

// Ensure temp directory exists
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true });
}

export const encodeVideo = async (
  inputPath: string,
  outputPath: string,
): Promise<EncodeResult> => {
  return new Promise((resolve) => {
    // Ensure output directory exists
    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // FFmpeg command for re-encoding to mp4
    // This is a basic configuration - adjust settings as needed
    const ffmpegArgs = [
      "-i",
      inputPath,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      "-y",
      outputPath,
    ];

    console.log(`Starting encode: ffmpeg ${ffmpegArgs.join(" ")}`);

    const ffmpeg = spawn("ffmpeg", ffmpegArgs);

    let stderr = "";
    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", (code) => {
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

export const getLocalPath = (s3Key: string, suffix: string): string => {
  const filename = s3Key.split("/").pop() || "video";
  return join(TEMP_DIR, `${filename}_${Date.now()}${suffix}`);
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
