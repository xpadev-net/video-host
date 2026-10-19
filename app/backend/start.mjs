import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const migrationLockName = "video-host-prisma-migrate";
let activeChild;
let activeConnection;
let shutdownSignal;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shutdownSignal = signal;
    if (activeChild) {
      activeChild.kill(signal);
    } else if (activeConnection) {
      // Destroying this dedicated session cancels GET_LOCK and releases it.
      activeConnection.destroy();
      process.exit(0);
    } else {
      process.exit(0);
    }
  });
}

function runChild(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env });
    activeChild = child;

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      activeChild = undefined;
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? signal}`));
      }
    });
  });
}

try {
  console.info("Waiting for the database migration lock");
  const databaseUrl = new URL(process.env.DATABASE_URL);
  const sslCert = databaseUrl.searchParams.get("sslcert");
  const sslIdentity = databaseUrl.searchParams.get("sslidentity");
  const sslAcceptValue = databaseUrl.searchParams.get("sslaccept");
  const sslAccept = sslAcceptValue?.toLowerCase();
  const sslModeValue =
    databaseUrl.searchParams.get("sslmode") ??
    databaseUrl.searchParams.get("ssl-mode");
  const sslMode = sslModeValue?.toLowerCase();
  if (sslAccept && !["strict", "accept_invalid_certs"].includes(sslAccept)) {
    throw new Error(`Unsupported MySQL sslaccept mode: ${sslAccept}`);
  }
  if (
    sslMode &&
    !["disable", "require", "verify-ca", "verify-full"].includes(sslMode)
  ) {
    throw new Error(`Unsupported MySQL SSL mode: ${sslMode}`);
  }
  if (sslMode === "disable" && (sslCert || sslIdentity || sslAccept)) {
    throw new Error("MySQL sslmode=disable conflicts with SSL certificate options");
  }
  const verifyCertificate =
    sslAccept === "strict" ||
    (!sslAccept && ["verify-ca", "verify-full"].includes(sslMode));
  const ssl =
    sslCert || sslIdentity || sslAccept || (sslMode && sslMode !== "disable")
      ? {
            ...(sslCert
              ? { ca: readFileSync(path.resolve("prisma", sslCert)) }
              : {}),
          ...(sslIdentity
            ? { pfx: readFileSync(path.resolve("prisma", sslIdentity)) }
            : {}),
          ...(databaseUrl.searchParams.has("sslpassword")
            ? { passphrase: databaseUrl.searchParams.get("sslpassword") }
            : {}),
          rejectUnauthorized: verifyCertificate,
        }
      : undefined;
  const connection = await mysql.createConnection({
    host: databaseUrl.hostname.replace(/^\[|\]$/g, ""),
    port: Number(databaseUrl.port || 3306),
    user: decodeURIComponent(databaseUrl.username),
    password: decodeURIComponent(databaseUrl.password),
    database: decodeURIComponent(databaseUrl.pathname.slice(1)),
    socketPath: databaseUrl.searchParams.get("socket") ?? undefined,
    connectTimeout:
      Number(databaseUrl.searchParams.get("connect_timeout") || 5) * 1000,
    ssl,
  });
  activeConnection = connection;
  let lockAcquired = false;
  try {
    const [rows] = await connection.execute(
      "SELECT GET_LOCK(?, ?) AS acquired",
      [migrationLockName, 1800],
    );
    if (Number(rows[0]?.acquired) !== 1) {
      throw new Error("Timed out waiting for the database migration lock");
    }
    lockAcquired = true;

    console.info("Applying database migrations");
    await runChild("./node_modules/.bin/prisma", ["migrate", "deploy"]);
  } finally {
    try {
      if (lockAcquired) {
        await connection.execute("SELECT RELEASE_LOCK(?)", [migrationLockName]);
      }
    } finally {
      activeConnection = undefined;
      await connection.end();
    }
  }

  if (shutdownSignal) {
    process.exit(0);
  }
  await runChild(process.execPath, ["dist/index.js"]);
} catch (error) {
  if (!shutdownSignal) {
    console.error(error);
  }
  process.exitCode = shutdownSignal ? 0 : 1;
}
