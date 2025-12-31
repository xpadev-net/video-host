import { describe, expect, it, vi } from "vitest";
import { DEV_DEFAULTS, EnvSchema, requireEnv } from "../env";

describe("requireEnv (legacy function)", () => {
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

/**
 * These tests verify the Zod-based environment validation schema.
 * We test the schema directly by parsing mock environments.
 */
describe("Environment Validation (Zod Schema)", () => {
  // Helper to create a minimal valid environment for production
  const createProductionEnv = (overrides: Record<string, string> = {}) => ({
    NODE_ENV: "production",
    JWT_SECRET: "real-jwt-secret-123",
    PASSWORD_SALT: "real-password-salt-123",
    CALLBACK_SECRET: "real-callback-secret-123",
    VOD_INTERNAL_SECRET: "real-vod-secret-123",
    ...overrides,
  });

  // Helper to create a minimal valid environment for development
  const createDevelopmentEnv = (overrides: Record<string, string> = {}) => ({
    NODE_ENV: "development",
    ...overrides,
  });

  describe("Production mode security requirements", () => {
    it("should fail when JWT_SECRET is missing in production", () => {
      const env = createProductionEnv();
      delete (env as Record<string, string | undefined>).JWT_SECRET;

      const result = EnvSchema.safeParse(env);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message).join(" ");
        expect(messages).toMatch(/JWT_SECRET/);
      }
    });

    it("should fail when PASSWORD_SALT is missing in production", () => {
      const env = createProductionEnv();
      delete (env as Record<string, string | undefined>).PASSWORD_SALT;

      const result = EnvSchema.safeParse(env);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message).join(" ");
        expect(messages).toMatch(/PASSWORD_SALT/);
      }
    });

    it("should fail when dev defaults are used in production", () => {
      const env = createProductionEnv({
        JWT_SECRET: DEV_DEFAULTS.JWT_SECRET, // Using dev default
      });

      const result = EnvSchema.safeParse(env);
      expect(result.success).toBe(false);
      if (!result.success) {
        const messages = result.error.issues.map((i) => i.message).join(" ");
        expect(messages).toMatch(/development default/);
      }
    });

    it("should succeed in production with all required secrets set", () => {
      const env = createProductionEnv();

      const result = EnvSchema.safeParse(env);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_SECRET).toBe("real-jwt-secret-123");
        expect(result.data.PASSWORD_SALT).toBe("real-password-salt-123");
      }
    });
  });

  describe("PASSWORD_HASH_ROUNDS validation", () => {
    it("should default to 12 rounds when not specified", () => {
      const env = createProductionEnv();
      // No PASSWORD_HASH_ROUNDS set

      const result = EnvSchema.safeParse(env);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PASSWORD_HASH_ROUNDS).toBe(12);
      }
    });

    it("should accept rounds >= 12", () => {
      const env = createProductionEnv({
        PASSWORD_HASH_ROUNDS: "14",
      });

      const result = EnvSchema.safeParse(env);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.PASSWORD_HASH_ROUNDS).toBe(14);
      }
    });

    it("should reject rounds < 12", () => {
      const env = createProductionEnv({
        PASSWORD_HASH_ROUNDS: "10",
      });

      const result = EnvSchema.safeParse(env);
      expect(result.success).toBe(false);
    });
  });

  describe("Development mode behavior", () => {
    it("should use dev defaults when secrets not set in development", () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const env = createDevelopmentEnv();
      const result = EnvSchema.safeParse(env);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_SECRET).toBe(DEV_DEFAULTS.JWT_SECRET);
        expect(result.data.PASSWORD_SALT).toBe(DEV_DEFAULTS.PASSWORD_SALT);
      }
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
      process.env.NODE_ENV = originalNodeEnv;
    });

    it("should use provided values over dev defaults in development", () => {
      const originalNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";

      const env = createDevelopmentEnv({
        JWT_SECRET: "custom-jwt-secret",
        PASSWORD_SALT: "custom-password-salt",
        CALLBACK_SECRET: "custom-callback-secret",
        VOD_INTERNAL_SECRET: "custom-vod-secret",
      });

      const result = EnvSchema.safeParse(env);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.JWT_SECRET).toBe("custom-jwt-secret");
        expect(result.data.PASSWORD_SALT).toBe("custom-password-salt");
      }

      process.env.NODE_ENV = originalNodeEnv;
    });
  });

  describe("Exported values validation", () => {
    it("should have all security-sensitive variables exported from module", async () => {
      // These values come from the test setup which runs before tests
      // Use dynamic import to get the already-loaded module
      const envModule = await import("../env");
      expect(envModule.JWT_SECRET).toBeDefined();
      expect(envModule.PASSWORD_SALT).toBeDefined();
      expect(envModule.CALLBACK_SECRET).toBeDefined();
      expect(envModule.VOD_INTERNAL_SECRET).toBeDefined();
    });

    it("should have PASSWORD_HASH_ROUNDS >= 12", async () => {
      const envModule = await import("../env");
      expect(envModule.PASSWORD_HASH_ROUNDS).toBeGreaterThanOrEqual(12);
    });
  });
});
