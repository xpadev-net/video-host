process.env.NODE_ENV ??= "development";
process.env.CALLBACK_SECRET ??= "test-only-callback-secret";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildSentinelClientOptions } = require("../src/queue.ts");

test("Sentinel options authenticate both Sentinel and data-node clients", () => {
  assert.deepEqual(
    buildSentinelClientOptions(
      "myprimary",
      "valkey-a:26379, valkey-b, valkey-c:26380",
      "shared-test-password",
    ),
    {
      name: "myprimary",
      sentinelRootNodes: [
        { host: "valkey-a", port: 26379 },
        { host: "valkey-b", port: 26379 },
        { host: "valkey-c", port: 26380 },
      ],
      sentinelClientOptions: { password: "shared-test-password" },
      nodeClientOptions: { password: "shared-test-password" },
    },
  );
});
