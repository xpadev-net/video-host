import { describe, expect, it } from "vitest";
import {
  createVodToken,
  signVodContentUrl,
  verifyVodToken,
} from "../lib/vod-token";

const key = "uploads/u1/abc.mp4";

describe("vod playback tokens", () => {
  it("verifies for the key it was issued for", () => {
    expect(verifyVodToken(createVodToken(key), key)).toBe(true);
  });

  it("is bound to the key", () => {
    expect(verifyVodToken(createVodToken(key), "uploads/u2/abc.mp4")).toBe(
      false,
    );
  });

  it("expires", () => {
    const token = createVodToken(key, 0);
    expect(verifyVodToken(token, key, 1000)).toBe(true);
    expect(verifyVodToken(token, key, 8 * 3600 * 1000)).toBe(false);
  });

  it("rejects tampering and malformed tokens", () => {
    const [exp, sig] = createVodToken(key).split(".");
    expect(verifyVodToken(`${Number(exp) + 3600}.${sig}`, key)).toBe(false);
    for (const bad of ["", "x", "1.2.3", `${exp}.`, `.${sig}`, "abc.def"]) {
      expect(verifyVodToken(bad, key)).toBe(false);
    }
  });

  it("is stable within an hour so nginx caches stay warm", () => {
    expect(createVodToken(key, 10_000)).toBe(createVodToken(key, 20_000));
  });
});

describe("signVodContentUrl", () => {
  const url = "https://host.example/vod/uploads/u1/abc.mp4/master.m3u8";

  it("inserts the token right after /vod/", () => {
    const signed = signVodContentUrl(url, key);
    const match =
      /^https:\/\/host\.example\/vod\/([^/]+)\/uploads\/u1\/abc\.mp4\/master\.m3u8$/.exec(
        signed,
      );
    expect(match).not.toBeNull();
    expect(verifyVodToken(match?.[1] ?? "", key)).toBe(true);
  });

  it("leaves URLs without a key or /vod/ marker alone", () => {
    expect(signVodContentUrl(url, null)).toBe(url);
    expect(signVodContentUrl("", key)).toBe("");
  });
});
