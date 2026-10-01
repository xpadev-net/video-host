import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import http from "node:http";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";

// Run after `pnpm -F @video-host/frontend build`. This uses an isolated local
// upstream and exercises the actual production Nitro proxy, not an auth mock.
test("production proxy preserves cookies, Origin, bodies, redirects and SSE", async (t) => {
  const upstream = http.createServer(async (request, response) => {
    if (request.url === "/api/auth/redirect") {
      response.writeHead(302, {
        Location: "https://example.invalid/do-not-follow",
      });
      return response.end();
    }
    if (request.url === "/api/v4/progress/test") {
      response.writeHead(200, { "Content-Type": "text/event-stream" });
      response.write('data: {"status":"processing"}\n\n');
      await delay(100);
      return response.end('data: {"status":"completed"}\n\n');
    }
    const body = [];
    for await (const chunk of request) body.push(chunk);
    response.writeHead(200, {
      "Content-Type": "application/json",
      "Set-Cookie": ["one=1; Path=/; HttpOnly", "two=2; Path=/; HttpOnly"],
    });
    response.end(
      JSON.stringify({
        body: Buffer.concat(body).toString(),
        cookie: request.headers.cookie,
        origin: request.headers.origin,
        forwardedHost: request.headers["x-forwarded-host"],
        forwardedFor: request.headers["x-forwarded-for"],
        realIp: request.headers["x-real-ip"],
        internalIp: request.headers["x-video-host-client-ip"],
      }),
    );
  });
  upstream.listen(0, "127.0.0.1");
  await once(upstream, "listening");
  t.after(() => {
    upstream.closeAllConnections();
    upstream.close();
  });

  const reserve = http.createServer().listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [".output/server/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      API_UPSTREAM_URL: `http://127.0.0.1:${upstream.address().port}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => server.kill());
  let logs = "";
  server.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  server.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      const health = await fetch(`${origin}/api/healthz`);
      assert.deepEqual(await health.json(), { message: "OK" });
      ready = true;
      break;
    } catch {
      await delay(50);
    }
  }
  assert.ok(ready, logs || "Production server did not become ready");

  const result = await fetch(`${origin}/api/auth/probe`, {
    method: "POST",
    headers: {
      Origin: origin,
      Cookie: "session=sample",
      "X-Forwarded-Host": "attacker.invalid",
      "X-Forwarded-For": "198.51.100.99",
      "X-Real-Ip": "198.51.100.88",
      "X-Video-Host-Client-Ip": "198.51.100.77",
      "Content-Type": "application/json",
    },
    body: '{"test":true}',
  });
  assert.deepEqual(result.headers.getSetCookie(), [
    "one=1; Path=/; HttpOnly",
    "two=2; Path=/; HttpOnly",
  ]);
  assert.deepEqual(await result.json(), {
    body: '{"test":true}',
    cookie: "session=sample",
    origin,
    forwardedFor: "198.51.100.99, 127.0.0.1",
  });
  const redirect = await fetch(`${origin}/api/auth/redirect`, {
    redirect: "manual",
  });
  assert.equal(redirect.status, 302);
  assert.equal(
    redirect.headers.get("location"),
    "https://example.invalid/do-not-follow",
  );
  const stream = await fetch(`${origin}/api/v4/progress/test`);
  assert.match(stream.headers.get("content-type"), /text\/event-stream/);
  const reader = stream.body.getReader();
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /processing/);
  assert.doesNotMatch(first, /completed/);
  let remaining = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    remaining += new TextDecoder().decode(chunk.value);
  }
  assert.match(remaining, /completed/);
});

test("Vite proxy anchors forged IP headers to the actual transport peer", async (t) => {
  const upstream = http
    .createServer((request, response) => {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(request.headers));
    })
    .listen(0, "127.0.0.1");
  await once(upstream, "listening");
  t.after(() => {
    upstream.closeAllConnections();
    upstream.close();
  });
  const reserve = http.createServer().listen(0, "127.0.0.1");
  await once(reserve, "listening");
  const port = reserve.address().port;
  await new Promise((resolve) => reserve.close(resolve));
  const server = spawn(
    process.execPath,
    ["node_modules/vite/bin/vite.js", "--port", String(port)],
    {
      cwd: new URL("..", import.meta.url),
      env: {
        ...process.env,
        API_UPSTREAM_URL: `http://127.0.0.1:${upstream.address().port}`,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  t.after(() => server.kill());
  let logs = "";
  server.stdout.on("data", (chunk) => {
    logs += chunk;
  });
  server.stderr.on("data", (chunk) => {
    logs += chunk;
  });
  let headers;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      const result = await fetch(`http://127.0.0.1:${port}/api/auth/probe`, {
        headers: {
          "x-forwarded-for": "198.51.100.99",
          "x-real-ip": "198.51.100.88",
          "x-video-host-client-ip": "198.51.100.77",
          "x-forwarded-host": "attacker.invalid",
          "x-forwarded-proto": "https",
          forwarded: "for=198.51.100.66",
        },
      });
      assert.equal(result.status, 200);
      headers = await result.json();
      break;
    } catch {
      await delay(50);
    }
  }
  assert.ok(headers, logs || "Vite proxy did not become ready");
  assert.equal(headers["x-forwarded-for"], "198.51.100.99, 127.0.0.1");
  for (const name of [
    "x-real-ip",
    "x-video-host-client-ip",
    "forwarded",
    "x-forwarded-host",
    "x-forwarded-proto",
  ])
    assert.equal(headers[name], undefined);
});
