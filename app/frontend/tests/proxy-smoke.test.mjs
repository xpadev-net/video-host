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
