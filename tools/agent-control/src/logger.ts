import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

export type DaemonLogger = {
  error: (event: string, details: Record<string, unknown>) => Promise<void>;
  info: (event: string, details?: Record<string, unknown>) => Promise<void>;
};

export function createDaemonLogger(logPath: string): DaemonLogger {
  const write = async (
    level: "error" | "info",
    event: string,
    details: Record<string, unknown> = {},
  ) => {
    await mkdir(path.dirname(logPath), { recursive: true });
    await appendFile(
      logPath,
      `${JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        event,
        ...details,
      })}\n`,
      "utf8",
    );
  };

  return {
    error: (event, details) => write("error", event, details),
    info: (event, details) => write("info", event, details),
  };
}
