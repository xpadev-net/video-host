import { describe, expect, it } from "vitest";
import { buildSentinelClientOptions } from "./redis";

describe("buildSentinelClientOptions", () => {
  it("passes Sentinel roots, primary name, and shared auth to both clients", () => {
    expect(
      buildSentinelClientOptions(
        "myprimary",
        "valkey-a:26379, valkey-b, valkey-c:26380",
        "sentinel-test-password",
        "node-test-password",
      ),
    ).toEqual({
      name: "myprimary",
      sentinelRootNodes: [
        { host: "valkey-a", port: 26379 },
        { host: "valkey-b", port: 26379 },
        { host: "valkey-c", port: 26380 },
      ],
      sentinelClientOptions: { password: "sentinel-test-password" },
      nodeClientOptions: { password: "node-test-password" },
    });
  });
});
