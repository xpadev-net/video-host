import { spawn } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const migrationLockName = "video-host-prisma-migrate";
let activeChild;
let shutdownSignal;

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    shutdownSignal = signal;
    activeChild?.kill(signal);
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
      } else if (shutdownSignal) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code ?? signal}`));
      }
    });
  });
}

try {
  console.info("Waiting for the database migration lock");
  await prisma.$transaction(
    async (transaction) => {
      // Interactive transactions pin every `transaction` query to one MySQL
      // connection. GET_LOCK is session-scoped, so this connection holds the
      // gate while the CLI migrates on its own connection.
      const result = await transaction.$queryRawUnsafe(
        "SELECT GET_LOCK(?, 1800) AS acquired",
        migrationLockName,
      );
      if (Number(result[0]?.acquired) !== 1) {
        throw new Error("Timed out waiting for the database migration lock");
      }

      try {
        console.info("Applying database migrations");
        await runChild("./node_modules/.bin/prisma", ["migrate", "deploy"]);
      } finally {
        await transaction.$queryRawUnsafe(
          "SELECT RELEASE_LOCK(?) AS released",
          migrationLockName,
        );
      }
    },
    { maxWait: 1_800_000, timeout: 86_400_000 },
  );

  await prisma.$disconnect();
  if (!shutdownSignal) {
    await runChild(process.execPath, ["dist/index.js"]);
  }
} catch (error) {
  console.error(error);
  process.exitCode = shutdownSignal ? 0 : 1;
} finally {
  await prisma.$disconnect();
}
