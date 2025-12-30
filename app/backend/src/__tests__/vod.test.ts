import { describe, expect, it } from "vitest";
import { isValidS3Key } from "../routes/api/v4/vod";

describe("isValidS3Key", () => {
  it("should accept valid s3 keys", () => {
    expect(isValidS3Key("uploads/user123/video.mp4")).toBe(true);
    expect(isValidS3Key("videos/2024/01/file.mp4")).toBe(true);
    expect(isValidS3Key("simple-file.mp4")).toBe(true);
    expect(isValidS3Key("path/to/nested/file.mp4")).toBe(true);
  });

  it("should reject path traversal attempts", () => {
    expect(isValidS3Key("../secret/file")).toBe(false);
    expect(isValidS3Key("uploads/../../../etc/passwd")).toBe(false);
    expect(isValidS3Key("foo/..")).toBe(false);
  });

  it("should reject URL-encoded path traversal attempts", () => {
    // %2F = /, %2E = .
    expect(isValidS3Key("uploads/%2E%2E/secret")).toBe(false);
    expect(isValidS3Key("%2E%2E%2Fetc/passwd")).toBe(false);
  });

  it("should reject absolute paths", () => {
    expect(isValidS3Key("/etc/passwd")).toBe(false);
    expect(isValidS3Key("/")).toBe(false);
  });

  it("should reject null bytes", () => {
    expect(isValidS3Key("file.mp4\0.txt")).toBe(false);
    expect(isValidS3Key("\0hidden")).toBe(false);
  });

  it("should reject empty keys", () => {
    expect(isValidS3Key("")).toBe(false);
  });

  it("should reject malformed URL encoding", () => {
    // Invalid percent encoding should cause decodeURIComponent to throw
    expect(isValidS3Key("%")).toBe(false);
    expect(isValidS3Key("%ZZ")).toBe(false);
  });
});
