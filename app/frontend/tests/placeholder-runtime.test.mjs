import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { cp, mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

// Build first with docker/.env.placeholder, as the container and CI do.
const frontend = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(frontend, ".output");

test("placeholder build prerenders a shell and survives runtime replacement", async (t) => {
  const shell = await readFile(path.join(output, "public/_shell.html"), "utf8");
  assert.match(shell, /<html/);
  const assets = await readdir(path.join(output, "public/assets"));
  const configAssets = [];
  for (const name of assets) {
    if (!name.endsWith(".js")) continue;
    const text = await readFile(
      path.join(output, "public/assets", name),
      "utf8",
    );
    if (text.includes("_VITE_API_ENDPOINT_")) configAssets.push(name);
  }
  assert.equal(
    configAssets.length,
    1,
    "Expected an unresolved API placeholder retained in the built config asset",
  );
  const assetName = configAssets[0];

  for (const scenario of [
    {
      name: "unresolved",
      endpoint: "",
      site: "Video Host",
      flag: false,
      replace: true,
      siteEnv: false,
    },
    {
      name: "same-origin",
      endpoint: "",
      site: "Runtime same-origin",
      flag: true,
      replace: true,
      siteEnv: true,
    },
    {
      name: "explicit-origin",
      endpoint: "https://api.example.test",
      site: `Runtime O'Neil "quote" <tag> $HOME & | \\path \` ${String.fromCharCode(36)}{window.name}`,
      flag: false,
      replace: true,
      siteEnv: true,
    },
  ]) {
    await t.test(scenario.name, async () => {
      const root = await mkdtemp(
        path.join(tmpdir(), "video-host-runtime-env-"),
      );
      const copy = path.join(root, "app/frontend/.output");
      try {
        await cp(output, copy, { recursive: true });
        if (scenario.replace) {
          const replace = spawnSync(
            "sh",
            [path.join(frontend, "docker/env-replacer.sh"), "true"],
            {
              cwd: root,
              env: {
                ...process.env,
                VITE_API_ENDPOINT: scenario.endpoint,
                VITE_SITE_NAME: scenario.siteEnv ? scenario.site : "",
                VITE_ENABLE_COMMENTS: String(scenario.flag),
              },
              encoding: "utf8",
            },
          );
          assert.equal(replace.status, 0, replace.stderr);
        }
        // Evaluate the actual optimized client config module, catching any
        // compile-time folding or placeholder detector overwritten by sed.
        const config = await import(
          pathToFileURL(path.join(copy, "public/assets", assetName)).href
        );
        assert.deepEqual(
          Object.values(config).sort(),
          [scenario.endpoint, scenario.site, scenario.flag].sort(),
        );

        const reserve = http.createServer().listen(0, "127.0.0.1");
        await once(reserve, "listening");
        const port = reserve.address().port;
        await new Promise((resolve) => reserve.close(resolve));
        const server = spawn(
          process.execPath,
          [path.join(copy, "server/index.mjs")],
          {
            cwd: root,
            env: { ...process.env, HOST: "127.0.0.1", PORT: String(port) },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let logs = "";
        server.stdout.on("data", (chunk) => {
          logs += chunk;
        });
        server.stderr.on("data", (chunk) => {
          logs += chunk;
        });
        try {
          let ready = false;
          const origin = `http://127.0.0.1:${port}`;
          for (let attempt = 0; attempt < 100; attempt += 1) {
            if (server.exitCode !== null) throw new Error(logs);
            try {
              const response = await fetch(`${origin}/api/healthz`);
              assert.equal(response.status, 200);
              assert.deepEqual(await response.json(), { message: "OK" });
              ready = true;
              break;
            } catch {
              await delay(50);
            }
          }
          assert.ok(ready, logs || "Server did not become ready");

          const assetResponse = await fetch(`${origin}/assets/${assetName}`);
          assert.equal(assetResponse.status, 200, logs);
          const assetBody = Buffer.from(await assetResponse.arrayBuffer());
          assert.equal(
            Number(assetResponse.headers.get("content-length")),
            assetBody.byteLength,
            "The served env asset must match its Content-Length",
          );
          const expectedEtag = `"${assetBody.byteLength.toString(16)}-${createHash(
            "sha1",
          )
            .update(assetBody)
            .digest("base64")
            .replace(/=$/, "")}"`;
          assert.equal(
            assetResponse.headers.get("etag"),
            expectedEtag,
            "The served env asset ETag must match its complete response body",
          );
          if (scenario.replace) {
            assert.doesNotMatch(
              assetBody.toString("utf8"),
              /_VITE_[A-Z0-9_]+_/,
            );
          }

          for (const route of ["/", "/login"]) {
            const response = await fetch(origin + route);
            assert.equal(response.status, 200, logs);
            const html = await response.text();
            assert.match(html, /<html/);
            assert.ok(
              html.includes(
                scenario.site.replace(/[&<>"']/g, (character) => {
                  const entities = {
                    "&": "&amp;",
                    "<": "&lt;",
                    ">": "&gt;",
                    '"': "&quot;",
                    "'": "&#x27;",
                  };
                  return entities[character];
                }),
              ),
              `${route} must render the configured site name`,
            );
            if (scenario.replace)
              assert.doesNotMatch(html, /_VITE_[A-Z0-9_]+_/);
          }
        } finally {
          if (server.exitCode === null) {
            const exited = once(server, "exit");
            server.kill();
            await exited;
          }
        }
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    });
  }
});
