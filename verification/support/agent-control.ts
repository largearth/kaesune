import {
  execFile,
  spawn,
  type ChildProcessWithoutNullStreams,
} from "node:child_process";

const repoRoot = process.cwd();

export function runAgentControlCli(
  arguments_: string[],
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    execFile(
      "pnpm",
      ["--silent", "okaeshi-control", ...arguments_],
      { cwd: repoRoot },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new Error(
              `okaeshi-control failed: ${error.message}\nstdout: ${stdout}\nstderr: ${stderr}`,
            ),
          );
          return;
        }
        const jsonLine = stdout
          .trim()
          .split("\n")
          .findLast((line) => line.trim().startsWith("{"));
        if (!jsonLine) {
          reject(new Error(`JSON response was not found in stdout: ${stdout}`));
          return;
        }
        resolve(JSON.parse(jsonLine) as Record<string, unknown>);
      },
    );
  });
}

export function startAgentControlDaemon(): Promise<ChildProcessWithoutNullStreams> {
  const child = spawn("pnpm", ["--silent", "okaeshi-control:daemon"], {
    cwd: repoRoot,
    detached: true,
    stdio: ["pipe", "pipe", "pipe"],
  });

  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `Agent Control daemon startup timed out.\nstdout: ${stdout}\nstderr: ${stderr}`,
        ),
      );
    }, 30_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (
        stdout
          .split("\n")
          .some((line) => line.startsWith("{") && line.includes('"ok":true'))
      ) {
        clearTimeout(timeout);
        resolve(child);
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Agent Control daemon exited before ready: code=${code} signal=${signal}\nstdout: ${stdout}\nstderr: ${stderr}`,
        ),
      );
    });
  });
}

export async function stopAgentControlDaemon(
  daemon: ChildProcessWithoutNullStreams | undefined,
): Promise<void> {
  if (!daemon?.pid || daemon.exitCode !== null) return;
  process.kill(-daemon.pid, "SIGTERM");
  await new Promise<void>((resolve) => daemon.once("exit", () => resolve()));
}
