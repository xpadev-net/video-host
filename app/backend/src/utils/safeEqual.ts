import { createHash, timingSafeEqual } from "node:crypto";

// Constant-time string comparison; hashing first makes the length irrelevant.
export const safeEqual = (a: string, b: string): boolean =>
  timingSafeEqual(
    createHash("sha256").update(a).digest(),
    createHash("sha256").update(b).digest(),
  );
