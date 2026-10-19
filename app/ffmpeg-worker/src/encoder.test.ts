import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

const testRoot = mkdtempSync(join(tmpdir(), "video-host-encoder-test-"));
const binDir = join(testRoot, "bin");
const scratchDir = join(testRoot, "scratch");
mkdirSync(binDir);
mkdirSync(scratchDir);

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  CALLBACK_SECRET: process.env.CALLBACK_SECRET,
  TEMP_DIR: process.env.TEMP_DIR,
  FFMPEG_THREADS: process.env.FFMPEG_THREADS,
  FFPROBE_RESPONSE: process.env.FFPROBE_RESPONSE,
  FFPROBE_DURATION: process.env.FFPROBE_DURATION,
  FFMPEG_MODE: process.env.FFMPEG_MODE,
  FFMPEG_STARTED_FILE: process.env.FFMPEG_STARTED_FILE,
  JOB_TIMEOUT_SECONDS: process.env.JOB_TIMEOUT_SECONDS,
  PATH: process.env.PATH,
};

process.env.NODE_ENV = "test";
process.env.CALLBACK_SECRET = "encoder-test-secret";
process.env.TEMP_DIR = scratchDir;
process.env.FFMPEG_THREADS = "1";
process.env.JOB_TIMEOUT_SECONDS = "30";
process.env.PATH = `${binDir}:${originalEnv.PATH ?? ""}`;

writeFileSync(
  join(binDir, "ffprobe"),
  `#!/bin/sh
case "$*" in
  *-show_streams*) printf '%s' "$FFPROBE_RESPONSE" ;;
  *) printf '%s' "$FFPROBE_DURATION" ;;
esac
`,
);
writeFileSync(
  join(binDir, "ffmpeg"),
  `#!/bin/sh
if [ "$FFMPEG_MODE" = "hang" ]; then
  : > "$FFMPEG_STARTED_FILE"
  exec sleep 30
fi
output=""
for argument do output="$argument"; done
: > "$output"
printf 'out_time_us=5000000\\n' >&2
sleep 0.05
printf 'speed=2.0x\\n' >&2
sleep 0.05
printf 'progress=continue\\n' >&2
sleep 0.05
printf 'out_time_us=10000000\\nspeed=2.0x\\nprogress=end\\n' >&2
`,
);
chmodSync(join(binDir, "ffprobe"), 0o755);
chmodSync(join(binDir, "ffmpeg"), 0o755);

process.env.FFPROBE_RESPONSE = JSON.stringify({
  format: { duration: "10", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
  streams: [
    {
      index: 0,
      codec_type: "video",
      width: 1920,
      height: 1080,
      disposition: { attached_pic: 0 },
    },
  ],
});
process.env.FFPROBE_DURATION = "10";

let encoder: typeof import("./encoder.js");
before(async () => {
  encoder = await import("./encoder.js");
});

after(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  rmSync(testRoot, { recursive: true, force: true });
});

test("FFmpeg progress parsing retains speed across stderr chunk boundaries", async () => {
  const progress: Array<{
    currentTime: number;
    duration: number;
    percent: number;
    speed?: number;
  }> = [];
  const result = await encoder.encodeVideo(
    join(testRoot, "input.mp4"),
    join(testRoot, "output.mp4"),
    (value) => {
      progress.push(value);
    },
  );

  assert.deepEqual(result, { success: true, duration: 10 });
  assert.ok(
    progress.some((value) => value.percent === 50 && value.speed === 2),
  );
  assert.ok(
    progress.some((value) => value.percent === 100 && value.speed === 2),
  );
});

test("unsupported media formats fail as permanent input errors", async () => {
  process.env.FFPROBE_RESPONSE = JSON.stringify({
    format: { duration: "10", format_name: "image2" },
    streams: [{ index: 0, codec_type: "video", width: 1920, height: 1080 }],
  });

  const result = await encoder.encodeVideo(
    join(testRoot, "unsupported.bin"),
    join(testRoot, "unsupported-output.mp4"),
  );

  assert.equal(result.success, false);
  assert.equal(result.kind, "permanent");
  assert.match(result.error ?? "", /Unsupported input format/);
  process.env.FFPROBE_RESPONSE = JSON.stringify({
    format: { duration: "10", format_name: "mov,mp4,m4a,3gp,3g2,mj2" },
    streams: [
      {
        index: 0,
        codec_type: "video",
        width: 1920,
        height: 1080,
        disposition: { attached_pic: 0 },
      },
    ],
  });
});

test("an abort signal stops FFmpeg and returns a transient result", async () => {
  process.env.FFMPEG_MODE = "hang";
  const startedFile = join(testRoot, "ffmpeg-started");
  process.env.FFMPEG_STARTED_FILE = startedFile;
  const controller = new AbortController();
  const resultPromise = encoder.encodeVideo(
    join(testRoot, "input-abort.mp4"),
    join(testRoot, "output-abort.mp4"),
    undefined,
    controller.signal,
  );

  const deadline = Date.now() + 3_000;
  while (!existsSync(startedFile) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.ok(existsSync(startedFile), "fake FFmpeg process should start");
  controller.abort();
  const result = await resultPromise;

  assert.equal(result.success, false);
  assert.equal(result.kind, "transient");
  assert.equal(result.error, "Encoding aborted");
});
