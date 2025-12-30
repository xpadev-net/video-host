import { describe, expect, it, vi } from "vitest";
import { requireEnv } from "../env";

describe("requireEnv", () => {
  it("should return value when env var is set", () => {
    process.env.TEST_VAR = "my-test-value";
    expect(requireEnv("TEST_VAR")).toBe("my-test-value");
    delete process.env.TEST_VAR;
  });

  it("should throw when required env var is missing in production", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    delete process.env.MISSING_VAR_PROD;

    expect(() => requireEnv("MISSING_VAR_PROD")).toThrow(/MISSING_VAR_PROD/);

    process.env.NODE_ENV = originalNodeEnv;
  });

  it("should use default in development when env var is missing", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    delete process.env.MISSING_VAR_DEV;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = requireEnv("MISSING_VAR_DEV", "dev-default");
    expect(result).toBe("dev-default");
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("MISSING_VAR_DEV not set"),
    );
    warnSpy.mockRestore();

    process.env.NODE_ENV = originalNodeEnv;
  });

  it("should throw when no default provided even in development", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    delete process.env.NO_DEFAULT_VAR;

    expect(() => requireEnv("NO_DEFAULT_VAR")).toThrow(/NO_DEFAULT_VAR/);

    process.env.NODE_ENV = originalNodeEnv;
  });

  it("should prefer env var over default even in development", () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    process.env.EXISTING_VAR = "actual-value";

    expect(requireEnv("EXISTING_VAR", "dev-default")).toBe("actual-value");

    delete process.env.EXISTING_VAR;
    process.env.NODE_ENV = originalNodeEnv;
  });
});
