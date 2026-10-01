import assert from "node:assert/strict";
import test from "node:test";
import { getApiProxyTarget } from "../src/server/api-upstream.ts";
import {
  validatePassword,
  validatePasswordMatch,
} from "../src/utils/authValidation.ts";
import {
  resolveApiEndpoint,
  resolveRuntimeFlag,
} from "../src/utils/runtimeEnv.ts";
import { getSafeCallback } from "../src/utils/safeCallback.ts";

test("callbacks allow local paths and retain literal percent/query/hash", () => {
  for (const path of [
    "/",
    "/dashboard",
    "/search/100%",
    "/movies/example?q=a%2Fb#time",
  ]) {
    assert.equal(getSafeCallback(path), path);
  }
});

test("callbacks reject external, protocol-relative and backslash redirects", () => {
  for (const path of [
    null,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/\nevil.example",
    "javascript:alert(1)",
  ]) {
    assert.equal(getSafeCallback(path), null);
  }
});

test("proxy fixes the origin and preserves API path/query", () => {
  assert.equal(
    getApiProxyTarget("/api/auth/get-session", "http://backend:3000"),
    "http://backend:3000/api/auth/get-session",
  );
  assert.equal(
    getApiProxyTarget("/api/v4/movies?page=2", "http://backend:3000"),
    "http://backend:3000/api/v4/movies?page=2",
  );
});

test("proxy rejects other routes, path traversal and untrusted origins", () => {
  for (const path of [
    "/api/healthz",
    "//evil.example/api/auth/get-session",
    "https://evil.example",
    "/api/auth/../../admin",
    "/api/auth/%2e%2e/%2e%2e/admin",
    "/api/auth\\evil",
  ]) {
    assert.throws(() => getApiProxyTarget(path, "http://backend:3000"));
  }
  for (const upstream of [
    "file:///tmp/api",
    "http://user:pass@backend",
    "http://backend/api",
    "http://backend?target=evil",
  ]) {
    assert.throws(() => getApiProxyTarget("/api/auth/get-session", upstream));
  }
});

test("registration password validation matches Better Auth bounds", () => {
  assert.equal(validatePassword("1234567").isValid, false);
  assert.equal(validatePassword("12345678").isValid, true);
  assert.equal(validatePassword("a".repeat(128)).isValid, true);
  assert.equal(validatePassword("a".repeat(129)).isValid, false);
  assert.equal(validatePasswordMatch("matching", "different").isValid, false);
  assert.equal(validatePasswordMatch("matching", "matching").isValid, true);
});

test("API endpoint placeholders are safe before runtime substitution", () => {
  assert.equal(resolveApiEndpoint(undefined), "");
  assert.equal(resolveApiEndpoint(""), "");
  assert.equal(resolveApiEndpoint("_VITE_API_ENDPOINT_"), "");
  assert.equal(
    resolveApiEndpoint("https://api.example.test"),
    "https://api.example.test",
  );
  assert.equal(
    resolveApiEndpoint("http://localhost:3001"),
    "http://localhost:3001",
  );
});

test("runtime flags remain configurable after placeholder builds", () => {
  assert.equal(resolveRuntimeFlag(undefined), false);
  assert.equal(resolveRuntimeFlag("_VITE_ENABLE_COMMENTS_"), false);
  assert.equal(resolveRuntimeFlag("_VITE_REQUIRE_SIGNUP_CODE_"), false);
  assert.equal(resolveRuntimeFlag("true"), true);
  assert.equal(resolveRuntimeFlag("false"), false);
});
