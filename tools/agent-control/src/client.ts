import type { AgentControlResponse } from "./response.js";
import { failure } from "./response.js";

const daemonOrigin = "http://127.0.0.1:4317";

type DoctorData = {
  checks: {
    daemon: { ok: boolean };
    frontend?: { ok: boolean; url: string };
    backend?: { ok: boolean; url: string };
    browser?: { ok: boolean };
  };
};

type DoctorResponse =
  | AgentControlResponse<DoctorData>
  | {
      ok: false;
      checks: DoctorData["checks"];
      error: {
        code: "HEALTH_CHECK_FAILED";
        message: string;
      };
    };

export async function requestDaemon<T extends object>(
  pathname: string,
  options: { body?: Record<string, unknown>; method?: "GET" | "POST" } = {},
): Promise<AgentControlResponse<T>> {
  try {
    const response = await fetch(`${daemonOrigin}${pathname}`, {
      method: options.method ?? "GET",
      headers: options.body
        ? { "content-type": "application/json" }
        : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    return (await response.json()) as AgentControlResponse<T>;
  } catch {
    return failure(
      "DAEMON_NOT_RUNNING",
      "Agent Control daemonへ接続できません。先にpnpm okaeshi-control:daemonを実行してください。",
    );
  }
}

export async function requestDoctor(): Promise<DoctorResponse> {
  const response = await requestDaemon<DoctorData>("/doctor");
  if (!response.ok && response.error.code === "DAEMON_NOT_RUNNING") {
    return {
      ok: false,
      checks: { daemon: { ok: false } },
      error: {
        code: "HEALTH_CHECK_FAILED",
        message: "One or more Agent Control dependencies are unavailable",
      },
    };
  }
  return response;
}
