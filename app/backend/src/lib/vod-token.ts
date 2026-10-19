import { createHmac } from "node:crypto";
import { VOD_INTERNAL_SECRET } from "@/env";
import { safeEqual } from "@/utils/safeEqual";

// How long a playback URL keeps working, at least. Expiry is rounded up to the
// hour so every response in the same hour carries the same token and nginx's
// per-URL caches stay effective.
const VOD_TOKEN_TTL_SECONDS = 6 * 3600;
const EXPIRY_GRANULARITY_SECONDS = 3600;

const signature = (s3Key: string, exp: number): string =>
  createHmac("sha256", VOD_INTERNAL_SECRET)
    .update(`vod-playback\n${exp}\n${s3Key}`)
    .digest("base64url");

/** Token granting playback of exactly one s3Key until its embedded expiry. */
export const createVodToken = (s3Key: string, nowMs = Date.now()): string => {
  const exp =
    Math.ceil(
      (nowMs / 1000 + VOD_TOKEN_TTL_SECONDS) / EXPIRY_GRANULARITY_SECONDS,
    ) * EXPIRY_GRANULARITY_SECONDS;
  return `${exp}.${signature(s3Key, exp)}`;
};

export const verifyVodToken = (
  token: string,
  s3Key: string,
  nowMs = Date.now(),
): boolean => {
  const [expPart, sig, ...rest] = token.split(".");
  if (!expPart || !sig || rest.length > 0 || !/^\d+$/.test(expPart)) {
    return false;
  }
  const exp = Number(expPart);
  if (!Number.isSafeInteger(exp) || exp * 1000 <= nowMs) {
    return false;
  }
  return safeEqual(sig, signature(s3Key, exp));
};

/**
 * Turns the stored `<origin>/vod/<key>/master.m3u8` into
 * `<origin>/vod/<token>/<key>/master.m3u8`. HLS segment URLs are relative to
 * the playlist, so they inherit the token. Only call this for callers already
 * allowed to watch the movie.
 */
const keyFromContentUrl = (path: string): string | null => {
  const suffix = "/master.m3u8";
  if (!path.endsWith(suffix)) {
    return null;
  }
  try {
    return path
      .slice(0, -suffix.length)
      .split("/")
      .map(decodeURIComponent)
      .join("/");
  } catch {
    return null;
  }
};

export const signVodContentUrl = (
  contentUrl: string,
  s3Key: string | null | undefined,
): string => {
  const marker = "/vod/";
  const index = contentUrl.indexOf(marker);
  if (index === -1) {
    return contentUrl;
  }
  const split = index + marker.length;
  // Variants created before `s3Key` was stored have it NULL, but their URL
  // still embeds the key: <origin>/vod/<key>/master.m3u8.
  const key = s3Key || keyFromContentUrl(contentUrl.slice(split));
  if (!key) {
    return contentUrl;
  }
  return `${contentUrl.slice(0, split)}${createVodToken(key)}/${contentUrl.slice(split)}`;
};
