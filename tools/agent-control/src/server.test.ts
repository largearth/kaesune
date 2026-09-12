import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AgentControlConfig } from "./config.js";
import { createSeedPaymentCreate } from "./seed.js";
import { createAgentControlServer } from "./server.js";

const openServers: ReturnType<typeof createAgentControlServer>[] = [];

afterEach(async () => {
  await Promise.all(
    openServers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

describe("Agent Control server", () => {
  it("doctorで全dependencyの正常状態を返す", async () => {
    const origin = await start({
      browserManager: fakeBrowserManager(),
      seedPaymentCreate: async () => undefined,
      fetchImplementation: async () => new Response("ok"),
    });

    const response = await fetch(`${origin}/doctor`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      checks: {
        daemon: { ok: true },
        frontend: { ok: true, url: "http://localhost:5173" },
        backend: { ok: true, url: "http://localhost:8787" },
        browser: { ok: true },
      },
    });
  });

  it.each([
    ["frontend", "http://localhost:5173"],
    ["backend", "http://localhost:8787"],
  ] as const)("doctorで停止した%sを報告する", async (_name, failedUrl) => {
    const origin = await start({
      browserManager: fakeBrowserManager(),
      seedPaymentCreate: async () => undefined,
      fetchImplementation: async (input) => {
        if (String(input) === failedUrl) throw new Error("unavailable");
        return new Response("ok");
      },
    });

    const response = await fetch(`${origin}/doctor`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      checks: { [_name]: { ok: false, url: failedUrl } },
      error: { code: "HEALTH_CHECK_FAILED" },
    });
  });

  it("doctorでbrowser未接続を報告する", async () => {
    const browserManager = fakeBrowserManager();
    browserManager.isBrowserConnected.mockReturnValue(false);
    const origin = await start({
      browserManager,
      seedPaymentCreate: async () => undefined,
      fetchImplementation: async () => new Response("ok"),
    });

    const response = await fetch(`${origin}/doctor`);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      ok: false,
      checks: { browser: { ok: false } },
      error: { code: "HEALTH_CHECK_FAILED" },
    });
  });

  it("session作成とbrowser操作をJSON endpointへ公開する", async () => {
    const seedPaymentCreate = vi.fn(async () => undefined);
    const browserManager = fakeBrowserManager();
    const origin = await start({ browserManager, seedPaymentCreate });

    const sessionResponse = await fetch(`${origin}/session`, {
      method: "POST",
    });
    expect(await sessionResponse.json()).toEqual({
      ok: true,
      session: "test-session",
      url: "/home",
    });
    expect(seedPaymentCreate).toHaveBeenCalledOnce();

    const selectResponse = await fetch(`${origin}/select`, {
      body: JSON.stringify({
        label: "出金元の財布",
        option: "E2E 出金作成用財布",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(await selectResponse.json()).toEqual({
      ok: true,
      label: "出金元の財布",
      option: "E2E 出金作成用財布",
    });

    expect(
      await (await fetch(`${origin}/console?errorsOnly=true`)).json(),
    ).toEqual({ ok: true, errors: [] });
    expect(browserManager.consoleReport).toHaveBeenCalledWith({
      errorsOnly: true,
    });

    expect(await (await fetch(`${origin}/network-summary`)).json()).toEqual({
      ok: true,
      summary: {
        total: 0,
        failed: 0,
        clientErrors: [],
        serverErrors: [],
        requestFailures: [],
      },
    });

    expect(
      await (await fetch(`${origin}/wait-settle`, { method: "POST" })).json(),
    ).toEqual({ ok: true, settled: true, waitedMs: 300 });
  });

  it("不正なrequestをINVALID_ARGUMENTに正規化する", async () => {
    const origin = await start({
      browserManager: fakeBrowserManager(),
      seedPaymentCreate: async () => undefined,
    });
    const response = await fetch(`${origin}/goto`, {
      body: JSON.stringify({}),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: {
        code: "INVALID_ARGUMENT",
        message: "pathには文字列を指定してください。",
      },
    });
  });

  it("seedのstderrをresponseへ漏らさずSEED_FAILEDを返す", async () => {
    const error = vi.fn(async () => undefined);
    const seedPaymentCreate = createSeedPaymentCreate(
      "/repo",
      { error, info: async () => undefined },
      async () => ({
        code: 1,
        signal: null,
        stderr: "private database error",
        stdout: "seed stdout",
      }),
    );
    const origin = await start({
      browserManager: fakeBrowserManager(),
      seedPaymentCreate,
    });

    const response = await fetch(`${origin}/session`, { method: "POST" });
    const responseText = await response.text();
    expect(JSON.parse(responseText)).toEqual({
      ok: false,
      error: {
        code: "SEED_FAILED",
        message:
          "検証データを準備できませんでした。daemonログを確認してください。",
      },
    });
    expect(responseText).not.toContain("private database error");
    expect(error).toHaveBeenCalledWith("payment-create-seed-failed", {
      code: 1,
      signal: null,
      stderr: "private database error",
      stdout: "seed stdout",
    });
  });
});

function fakeBrowserManager() {
  return {
    clickByRole: vi.fn(async () => "/records"),
    consoleReport: vi.fn((options?: { errorsOnly?: boolean }) =>
      options?.errorsOnly ? { errors: [] } : { errors: [], warnings: [] },
    ),
    createAuthenticatedSession: vi.fn(async () => ({
      session: "test-session",
      url: "/home",
    })),
    goto: vi.fn(async (path: string) => path),
    hasSession: vi.fn(() => true),
    isBrowserConnected: vi.fn(() => true),
    networkSummary: vi.fn(() => ({
      total: 0,
      failed: 0,
      clientErrors: [],
      serverErrors: [],
      requestFailures: [],
    })),
    screenshot: vi.fn(async () => ({
      path: "artifacts/agent/screenshots/test.png",
      url: "/records",
    })),
    selectByLabel: vi.fn(async (_label: string, option: string) => option),
    snapshot: vi.fn(async () => ({ elements: [], url: "/home" })),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    typeByLabel: vi.fn(async (_label: string, value: string) => value),
    waitForSettle: vi.fn(async () => ({
      settled: true as const,
      waitedMs: 300,
    })),
  };
}

async function start({
  browserManager,
  seedPaymentCreate,
  fetchImplementation,
}: {
  browserManager: ReturnType<typeof fakeBrowserManager>;
  seedPaymentCreate: () => Promise<void>;
  fetchImplementation?: typeof fetch;
}): Promise<string> {
  const config: AgentControlConfig = {
    apiOrigin: "http://localhost:8787",
    artifactRoot: "/tmp/artifacts",
    daemonHost: "127.0.0.1",
    daemonLogPath: "/tmp/agent-control.log",
    daemonPort: 4317,
    environment: "development",
    repoRoot: "/repo",
    verificationPassword: "password",
    verificationUserEmail: "verification@example.test",
    webOrigin: "http://localhost:5173",
  };
  const server = createAgentControlServer({
    browserManager,
    config,
    logger: {
      error: async () => undefined,
      info: async () => undefined,
    },
    seedPaymentCreate,
    fetchImplementation,
  });
  openServers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
