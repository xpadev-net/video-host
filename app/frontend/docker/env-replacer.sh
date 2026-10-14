#!/usr/bin/env sh

set -e

# Replace public Vite placeholders literally, so shell and sed metacharacters in
# runtime values cannot alter the replacement or be interpreted as syntax.
# Nitro's public-asset manifest also carries the size and ETag used by its static
# response handler, so refresh those fields after substitution.
node <<'NODE'
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const outputRoots = [
  path.resolve("app/frontend/.output/public"),
  path.resolve("app/frontend/.output/server"),
];
const textExtensions = new Set([".js", ".mjs", ".css", ".html", ".json"]);
const runtimeValues = Object.entries(process.env).filter(([name]) =>
  name.startsWith("VITE_"),
);

function replaceInDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      replaceInDirectory(filePath);
      continue;
    }
    if (!entry.isFile() || !textExtensions.has(path.extname(entry.name))) {
      continue;
    }

    let content = fs.readFileSync(filePath, "utf8");
    const original = content;
    for (const [name, value] of runtimeValues) {
      const replacement = [".js", ".mjs"].includes(path.extname(filePath))
        ? value
            .replace(/\\/g, "\\\\")
            .replace(/`/g, "\\`")
            .replace(/\$\{/g, "\\${")
            .replace(/"/g, '\\"')
            .replace(/\r/g, "\\r")
            .replace(/\n/g, "\\n")
            .replace(/\u2028/g, "\\u2028")
            .replace(/\u2029/g, "\\u2029")
        : value;
      content = content.split(`_${name}_`).join(replacement);
    }
    if (content !== original) fs.writeFileSync(filePath, content);
  }
}

for (const outputRoot of outputRoots) replaceInDirectory(outputRoot);

const serverRoot = path.resolve("app/frontend/.output/server");
const publicRoot = path.resolve("app/frontend/.output/public");
const manifestPath = path.join(serverRoot, "index.mjs");
const source = fs.readFileSync(manifestPath, "utf8");
const manifestStart = source.indexOf("var public_assets_data_default = {");
if (manifestStart === -1) {
  throw new Error("Nitro public asset manifest was not found");
}

const objectStart = source.indexOf("{", manifestStart);
const objectEnd = source.indexOf("\n};", objectStart);
if (objectEnd === -1) {
  throw new Error("Nitro public asset manifest could not be bounded");
}

let entryCount = 0;
let updatedCount = 0;
const manifest = source.slice(objectStart, objectEnd + 2).replace(
  /(\"\/[^\"]+\":\s*\{[^{}]*\})/g,
  (entry) => {
    const assetPathMatch = entry.match(/\"path\":\s*(\"(?:\\.|[^\"\\])*\")/);
    const etagMatch = entry.match(/\"etag\":\s*(\"(?:\\.|[^\"\\])*\")/);
    const sizeMatch = entry.match(/\"size\":\s*(\d+)/);
    if (!assetPathMatch || !etagMatch || !sizeMatch) return entry;

    const filePath = path.resolve(serverRoot, JSON.parse(assetPathMatch[1]));
    const publicRelativePath = path.relative(publicRoot, filePath);
    if (
      publicRelativePath === "" ||
      publicRelativePath === ".." ||
      publicRelativePath.startsWith(`..${path.sep}`) ||
      path.isAbsolute(publicRelativePath)
    ) {
      return entry;
    }

    entryCount += 1;
    const content = fs.readFileSync(filePath);
    const digest = crypto
      .createHash("sha1")
      .update(content)
      .digest("base64")
      .replace(/=$/, "");
    const etag = `\"${content.length.toString(16)}-${digest}\"`;

    if (Number(sizeMatch[1]) === content.length && JSON.parse(etagMatch[1]) === etag) {
      return entry;
    }

    updatedCount += 1;
    return entry
      .replace(/(\"etag\":\s*)\"(?:\\.|[^\"\\])*\"/, `$1${JSON.stringify(etag)}`)
      .replace(/(\"size\":\s*)\d+/, `$1${content.length}`);
  },
);

if (entryCount === 0) {
  throw new Error("Nitro public asset manifest has no readable public files");
}

if (updatedCount > 0) {
  fs.writeFileSync(
    manifestPath,
    source.slice(0, objectStart) + manifest + source.slice(objectEnd + 2),
  );
}
NODE

# Execute the application main command.
exec "$@"
