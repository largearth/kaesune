import { spawn } from "node:child_process";

import { AgentControlError } from "./errors.js";
import type { DaemonLogger } from "./logger.js";

export type SeedPaymentCreate = () => Promise<void>;

export type SeedProcessResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
};

export type RunSeedProcess = (repoRoot: string) => Promise<SeedProcessResult>;

export function createSeedPaymentCreate(
  repoRoot: string,
  logger: DaemonLogger,
  runSeedProcess: RunSeedProcess = runPaymentCreateSeedProcess,
): SeedPaymentCreate {
  return async () => {
    const result = await runSeedProcess(repoRoot).catch(
      async (error: unknown) => {
        await writeSeedLog(
          logger,
          "error",
          "payment-create-seed-spawn-failed",
          {
            error: error instanceof Error ? error.stack : String(error),
          },
        );
        throw new AgentControlError(
          "SEED_FAILED",
          "検証データを準備できませんでした。daemonログを確認してください。",
          500,
        );
      },
    );

    if (result.code !== 0) {
      await writeSeedLog(logger, "error", "payment-create-seed-failed", result);
      throw new AgentControlError(
        "SEED_FAILED",
        "検証データを準備できませんでした。daemonログを確認してください。",
        500,
      );
    }

    await writeSeedLog(logger, "info", "payment-create-seed-completed");
  };
}

async function writeSeedLog(
  logger: DaemonLogger,
  level: "error" | "info",
  event: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  try {
    await logger[level](event, details);
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        level: "error",
        event: "daemon-log-write-failed",
        message: error instanceof Error ? error.message : String(error),
      })}\n`,
    );
  }
}

function runPaymentCreateSeedProcess(
  repoRoot: string,
): Promise<SeedProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["--filter", "backend", "verify:seed-payment-create"],
      {
        cwd: repoRoot,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code, signal) =>
      resolve({ code, signal, stderr, stdout }),
    );
  });
}
