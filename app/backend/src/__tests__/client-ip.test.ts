import { once } from "node:events";
import http from "node:http";
import { networkInterfaces } from "node:os";
import { serve } from "@hono/node-server";
import { getConnInfo } from "@hono/node-server/conninfo";
import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import {
  AUTH_CLIENT_IP_HEADER,
  createTrustedProxyList,
  requestWithClientIp,
  resolveClientIp,
} from "../lib/client-ip";

vi.mock("@/env", () => ({ AUTH_TRUSTED_PROXY_CIDRS: ["10.0.0.0/24"] }));
vi.mock("@/lib/auth", () => ({
  auth: {
    handler: (request: Request) =>
      Response.json(Object.fromEntries(request.headers)),
  },
}));

const trusted = createTrustedProxyList(["10.0.0.0/24", "2001:db8:100::/48"]);
const serverAddress = Object.values(networkInterfaces())
  .flat()
  .find((entry) => entry?.family === "IPv4" && !entry.internal)?.address;

describe("transport-bound auth client IP", () => {
  it("ignores every forwarded header from untrusted direct peers", () => {
    const request = new Request(
      "https://video.example.com/api/auth/get-session",
      {
        headers: {
          "x-forwarded-for": "10.0.0.2, 198.51.100.2",
          "x-real-ip": "198.51.100.3",
          [AUTH_CLIENT_IP_HEADER]: "198.51.100.4",
          forwarded: 'for="198.51.100.5"',
          cookie: "session=synthetic",
        },
      },
    );
    const result = requestWithClientIp(request, "203.0.113.9", trusted);
    expect(result.headers.get(AUTH_CLIENT_IP_HEADER)).toBe("203.0.113.9");
    expect(result.headers.get("cookie")).toBe("session=synthetic");
    for (const key of ["x-forwarded-for", "x-real-ip", "forwarded"])
      expect(result.headers.has(key)).toBe(false);
  });
  it("walks trusted frontend/ingress hops from the right, ignoring forged prefixes", () => {
    expect(
      resolveClientIp(
        "10.0.0.2",
        "garbage, 10.0.0.9, 198.51.100.4, 10.0.0.3",
        trusted,
      ),
    ).toBe("198.51.100.4");
    expect(resolveClientIp("10.0.0.2", "198.51.100.5", trusted)).toBe(
      "198.51.100.5",
    );
    expect(resolveClientIp("203.0.113.1", "invalid", trusted)).toBe(
      "203.0.113.1",
    );
  });
  it("handles IPv6 and IPv4-mapped socket peers", () => {
    expect(
      resolveClientIp(
        "::ffff:10.0.0.2",
        "2001:db8:200::5, 2001:db8:100::1",
        trusted,
      ),
    ).toBe("2001:db8:200::5");
    expect(resolveClientIp("::ffff:a00:2", "198.51.100.5", trusted)).toBe(
      "198.51.100.5",
    );
  });
  it.each([undefined, "", "invalid", "fe80::1%eth0"])(
    "fails closed without a valid socket peer: %s",
    (peer) => {
      expect(() => resolveClientIp(peer, "198.51.100.1", trusted)).toThrow();
    },
  );
  it.each([
    null,
    "",
    "invalid",
    "10.0.0.3",
    "10.0.0.4, 10.0.0.3",
    "198.51.100.1,",
    "198.51.100.1, fe80::1%eth0",
    "198.51.100.1,".repeat(33),
    "x".repeat(4097),
  ])("fails closed on malformed trusted chains: %s", (chain) => {
    expect(() => resolveClientIp("10.0.0.2", chain, trusted)).toThrow();
  });
  it.each([
    "*",
    "0.0.0.0/0",
    "::/0",
    "::/64",
    "::ffff:0.0.0.0/96",
    "::ffff:10.0.0.0/120",
    "0:0:0:0:0:ffff:a00:1",
    "10.0.0.1/33",
    "::1/129",
    "::1/-1",
    "10.0.0.1/",
    "10.0.0.1/24/x",
    "fe80::1%eth0/64",
  ])("rejects unsafe proxy range %s", (cidr) => {
    expect(() => createTrustedProxyList([cidr])).toThrow();
  });
  it.skipIf(!serverAddress)(
    "uses the remote Node socket endpoint, distinct from the server endpoint",
    async () => {
      const { handleAuthRequest } = await import("../lib/auth-handler.js");
      let socketMetadata: ReturnType<typeof getConnInfo> | undefined;
      const app = new Hono()
        .use("/api/auth/*", async (c, next) => {
          if (
            c.env !== null &&
            typeof c.env === "object" &&
            "incoming" in c.env
          ) {
            socketMetadata = getConnInfo(c);
          }
          await next();
        })
        .on(["GET", "POST"], "/api/auth/*", handleAuthRequest);
      const address = serverAddress as string;
      const server = serve({ fetch: app.fetch, hostname: address, port: 0 });
      await once(server, "listening");
      try {
        const serverEndpoint = server.address() as {
          address: string;
          port: number;
        };
        const port = serverEndpoint.port;
        const result = await new Promise<Record<string, string>>(
          (resolve, reject) => {
            http
              .get(
                {
                  hostname: address,
                  port,
                  path: "/api/auth/get-session",
                  localAddress: "127.0.0.1",
                  headers: {
                    "x-forwarded-for": "198.51.100.99",
                    "x-real-ip": "198.51.100.88",
                    [AUTH_CLIENT_IP_HEADER]: "198.51.100.77",
                  },
                },
                (response) => {
                  let body = "";
                  response.on("data", (data) => {
                    body += data;
                  });
                  response.on("end", () => resolve(JSON.parse(body)));
                },
              )
              .on("error", reject);
          },
        );
        expect(result[AUTH_CLIENT_IP_HEADER]).toBe("127.0.0.1");
        expect(socketMetadata?.remote.address).toBe("127.0.0.1");
        expect(serverEndpoint.address).toBe(address);
        expect(socketMetadata?.remote.address).not.toBe(serverEndpoint.address);
        expect(result["x-forwarded-for"]).toBeUndefined();
        expect(
          (await app.request("http://localhost/api/auth/get-session")).status,
        ).toBe(503);
      } finally {
        server.close();
        await once(server, "close");
      }
    },
  );
});
