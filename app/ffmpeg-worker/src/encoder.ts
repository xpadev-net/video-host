import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { FFMPEG_THREADS, JOB_TIMEOUT_SECONDS, TEMP_DIR } from "./env";

const PROBE_TIMEOUT_MS = 30_000;
const PROCESS_KILL_GRACE_MS = 5_000;
const MAX_PROBE_OUTPUT_BYTES = 1024 * 1024;
const MAX_FFMPEG_STDERR_BYTES = 8 * 1024;
const MAX_VIDEO_WIDTH = 3840;
const MAX_VIDEO_HEIGHT = 2160;
const MAX_VIDEO_PIXELS = MAX_VIDEO_WIDTH * MAX_VIDEO_HEIGHT;
const MAX_VIDEO_DURATION_SECONDS = 2 * 60 * 60;
const ALLOWED_INPUT_FORMATS = new Set([
  "mov,mp4,m4a,3gp,3g2,mj2",
  "matroska,webm",
  "avi",
  "mpegts",
  "mpeg",
  "flv",
  "asf",
]);

class PermanentMediaInputError extends Error {}

interface ProbeResult {
  duration: number;
  videoMap: string;
}

const probeMedia = async (
  inputPath: string,
  signal?: AbortSignal,
): Promise<ProbeResult> => {
  const { stdout } = await runFfprobe(
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration,format_name:stream=index,codec_type,width,height:stream_disposition=attached_pic",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      "-probesize",
      "50M",
      "-analyzeduration",
      "10M",
      inputPath,
    ],
    signal,
  );
  const parsed = JSON.parse(stdout) as {
    format?: { duration?: string; format_name?: string };
    streams?: {
      index: number;
      codec_type?: string;
      width?: number;
      height?: number;
      disposition?: { attached_pic?: number };
    }[];
  };
  const duration = Number.parseFloat(parsed.format?.duration ?? "");
  if (!ALLOWED_INPUT_FORMATS.has(parsed.format?.format_name ?? "")) {
    throw new PermanentMediaInputError(
      `Unsupported input format: ${parsed.format?.format_name || "unknown"}`,
    );
  }
  const videoStreams = (parsed.streams ?? []).filter(
    (stream) =>
      stream.codec_type === "video" && stream.disposition?.attached_pic !== 1,
  );
  const bestVideo = videoStreams.reduce<(typeof videoStreams)[number] | null>(
    (best, stream) =>
      !best ||
      (stream.width ?? 0) * (stream.height ?? 0) >
        (best.width ?? 0) * (best.height ?? 0)
        ? stream
        : best,
    null,
  );

  if (!bestVideo) {
    throw new PermanentMediaInputError("Input contains no video stream");
  }
  const width = bestVideo.width ?? 0;
  const height = bestVideo.height ?? 0;
  if (
    width < 1 ||
    height < 1 ||
    width > MAX_VIDEO_WIDTH ||
    height > MAX_VIDEO_HEIGHT ||
    width * height > MAX_VIDEO_PIXELS
  ) {
    throw new PermanentMediaInputError(
      `Video dimensions exceed the ${MAX_VIDEO_WIDTH}x${MAX_VIDEO_HEIGHT} limit: ${width}x${height}`,
    );
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new PermanentMediaInputError("Input duration is missing or invalid");
  }
  if (duration > MAX_VIDEO_DURATION_SECONDS) {
    throw new PermanentMediaInputError(
      `Video duration exceeds the ${MAX_VIDEO_DURATION_SECONDS}-second limit`,
    );
  }

  return {
    duration,
    videoMap: `0:${bestVideo.index}`,
  };
};

const runFfprobe = (
  args: string[],
  signal?: AbortSignal,
): Promise<{ stdout: string }> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("ffprobe aborted before start"));
      return;
    }

    const ffprobe = spawn(
      "ffprobe",
      ["-protocol_whitelist", "file,crypto", ...args],
      {
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    let stdout = "";
    let outputBytes = 0;
    let forcedError: Error | null = null;
    let finished = false;
    let killTimer: NodeJS.Timeout | undefined;
    const timeout = setTimeout(() => {
      forcedError = new Error(`ffprobe timed out after ${PROBE_TIMEOUT_MS}ms`);
      terminate();
    }, PROBE_TIMEOUT_MS);

    const terminate = () => {
      if (ffprobe.exitCode !== null || ffprobe.signalCode !== null) return;
      ffprobe.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (ffprobe.exitCode === null && ffprobe.signalCode === null) {
          ffprobe.kill("SIGKILL");
        }
      }, PROCESS_KILL_GRACE_MS);
      killTimer.unref();
    };
    const onAbort = () => {
      forcedError = new Error("ffprobe aborted");
      terminate();
    };
    const finish = (error?: Error, value?: { stdout: string }) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener("abort", onAbort);
      if (error) reject(error);
      else resolve(value as { stdout: string });
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
    ffprobe.stdout.on("data", (data: Buffer) => {
      outputBytes += data.length;
      if (outputBytes > MAX_PROBE_OUTPUT_BYTES) {
        forcedError = new Error("ffprobe output exceeded 1 MiB");
        terminate();
        return;
      }
      stdout += data.toString();
    });
    ffprobe.on("error", (error) => finish(error));
    ffprobe.on("close", (code, childSignal) => {
      if (forcedError) {
        finish(forcedError);
      } else if (signal?.aborted) {
        finish(new Error("ffprobe aborted"));
      } else if (code !== 0) {
        finish(
          new Error(
            `ffprobe exited with code ${code ?? "null"}${childSignal ? ` (${childSignal})` : ""}`,
          ),
        );
      } else {
        finish(undefined, { stdout });
      }
    });
  });

export interface EncodeResult {
  success: boolean;
  permanent?: boolean;
  outputPath?: string;
  duration?: number;
  error?: string;
}

export type ProgressCallback = (progress: {
  currentTime: number;
  duration: number;
  percent: number;
}) => void | Promise<void>;

// Ensure temp directory exists
if (!existsSync(TEMP_DIR)) {
  mkdirSync(TEMP_DIR, { recursive: true });
}

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

  let inputMetadata: ProbeResult;
  try {
    inputMetadata = await probeMedia(inputPath, abortSignal);
  } catch (error) {
    return {
      success: false,
      permanent: error instanceof PermanentMediaInputError,
      error: `Failed to probe input: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const { duration: inputDuration, videoMap } = inputMetadata;

  return new Promise((resolve) => {
    // Ensure output directory exists
    const outputDir = dirname(outputPath);
    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    // FFmpeg command for re-encoding to mp4
    // Keep all audio streams so multi-audio sources stay selectable when
    // packaged as HLS by nginx-vod-module.
    const ffmpegArgs = [
      "-nostdin",
      "-protocol_whitelist",
      "file,crypto",
      "-i",
      inputPath,
      "-map",
      videoMap,
      "-map",
      "0:a?",
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

    const ffmpeg = spawn("ffmpeg", ffmpegArgs, {
      stdio: ["ignore", "ignore", "pipe"],
    });
    let settled = false;
    let stderrTail = "";
    let timedOut = false;
    let killTimer: NodeJS.Timeout | undefined;
    let timeoutTimer: NodeJS.Timeout | undefined;
    const finish = (result: EncodeResult) => {
      if (settled) return;
      settled = true;
      if (killTimer) clearTimeout(killTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      abortSignal?.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onAbort = () => {
      console.log("Encoding aborted due to timeout or cancellation");
      if (ffmpeg.exitCode !== null || ffmpeg.signalCode !== null) return;
      ffmpeg.kill("SIGTERM");
      killTimer = setTimeout(() => {
        if (ffmpeg.exitCode === null && ffmpeg.signalCode === null) {
          console.log("Force killing FFmpeg process (SIGTERM ignored)");
          ffmpeg.kill("SIGKILL");
        }
      }, PROCESS_KILL_GRACE_MS);
      killTimer.unref();
    };
    abortSignal?.addEventListener("abort", onAbort, { once: true });
    if (abortSignal?.aborted) onAbort();
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      onAbort();
    }, JOB_TIMEOUT_SECONDS * 1000);
    timeoutTimer.unref();

    let lastProgressAt = 0;
    let lastProgressPercent = -1;
    let progressCallbackInFlight = false;
    ffmpeg.stderr.on("data", (data) => {
      const line = data.toString();
      stderrTail = (stderrTail + line).slice(-MAX_FFMPEG_STDERR_BYTES);

      // Parse progress if callback provided and we have duration
      if (onProgress && inputDuration > 0) {
        const currentTime = parseTimeFromStderr(line);
        if (currentTime !== null) {
          const percent = Math.min(
            100,
            Math.round((currentTime / inputDuration) * 100),
          );
          const now = Date.now();
          if (
            !progressCallbackInFlight &&
            (percent > lastProgressPercent || now - lastProgressAt >= 1000)
          ) {
            lastProgressAt = now;
            lastProgressPercent = percent;
            progressCallbackInFlight = true;
            void Promise.resolve()
              .then(() =>
                onProgress({
                  currentTime: Math.round(currentTime),
                  duration: Math.round(inputDuration),
                  percent,
                }),
              )
              .catch((error) => {
                console.warn("Failed to report encoding progress:", error);
              })
              .finally(() => {
                progressCallbackInFlight = false;
              });
          }
        }
      }
    });

    ffmpeg.on("close", (code, childSignal) => {
      if (timeoutTimer) clearTimeout(timeoutTimer);
      // Check if aborted
      if (abortSignal?.aborted) {
        finish({
          success: false,
          error: "Encoding aborted due to timeout",
        });
        return;
      }
      if (timedOut) {
        finish({ success: false, error: "FFmpeg timed out" });
        return;
      }

      if (code === 0 && existsSync(outputPath)) {
        // Get duration from ffprobe
        getDuration(outputPath, abortSignal)
          .then((duration) => {
            finish({ success: true, outputPath, duration });
          })
          .catch((error) => {
            finish({
              success: false,
              error: `Failed to probe encoded output: ${error instanceof Error ? error.message : String(error)}`,
            });
          });
      } else {
        const termination = childSignal
          ? `terminated by ${childSignal}${childSignal === "SIGKILL" ? " (possible memory limit/OOM kill)" : ""}`
          : `exited with code ${code ?? "null"}`;
        finish({
          success: false,
          error: `FFmpeg ${termination}: ${stderrTail}`,
        });
      }
    });

    ffmpeg.on("error", (err) => {
      finish({
        success: false,
        error: `Failed to start FFmpeg: ${err.message}`,
      });
    });
  });
};

const getDuration = async (
  filePath: string,
  signal?: AbortSignal,
): Promise<number> => {
  const { stdout } = await runFfprobe(
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      filePath,
    ],
    signal,
  );
  const duration = Number.parseFloat(stdout.trim());
  return Number.isFinite(duration) ? Math.round(duration) : 0;
};

const sanitizeFilename = (name: string): string => {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255);
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
