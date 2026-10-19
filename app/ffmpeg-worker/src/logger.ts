import { AsyncLocalStorage } from "node:async_hooks";
import pino, { type Logger } from "pino";

const serviceName = process.env.OTEL_SERVICE_NAME || "video-host-ffmpeg-worker";
const baseLogger = pino({
  base: {
    "service.name": serviceName,
    "service.version": process.env.COMMIT_HASH || "unknown",
  },
  level: process.env.LOG_LEVEL || "info",
  messageKey: "message",
  timestamp: pino.stdTimeFunctions.isoTime,
});
const loggerContext = new AsyncLocalStorage<Logger>();

/** A context-aware logger so job bindings follow async work across modules. */
const write = (
  level: "debug" | "info" | "warn" | "error",
  args: unknown[],
): void => {
  const activeLogger = loggerContext.getStore() ?? baseLogger;
  const first = args[0];
  const second = args[1];
  if (second instanceof Error) {
    activeLogger[level]({ err: second }, String(first));
  } else if (args.length > 1) {
    activeLogger[level]({ detail: second }, String(first));
  } else {
    activeLogger[level](first as string);
  }
};

export const log = {
  debug: (...args: unknown[]) => write("debug", args),
  info: (...args: unknown[]) => write("info", args),
  warn: (...args: unknown[]) => write("warn", args),
  error: (...args: unknown[]) => write("error", args),
  child: (bindings: Record<string, unknown>) =>
    (loggerContext.getStore() ?? baseLogger).child(bindings),
};

export const withLogContext = <T>(logger: Logger, callback: () => T): T =>
  loggerContext.run(logger, callback);
