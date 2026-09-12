import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { BrowserManager } from "./browser-manager.js";
import type { AgentControlConfig } from "./config.js";

describe("BrowserManager", () => {
  let apiServer: Server;
  let webServer: Server;
  let apiOrigin: string;
  let webOrigin: string;
  let artifactRoot: string;

  beforeAll(async () => {
    artifactRoot = await mkdtemp(path.join(os.tmpdir(), "okaeshi-control-"));
    apiServer = createServer((request, response) => {
      const pathname = new URL(request.url ?? "/", "http://test").pathname;
      const commonHeaders = {
        "content-type": "application/json",
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization,content-type",
        "set-cookie": "session=test; Path=/; HttpOnly",
      };
      if (request.method === "OPTIONS") {
        response.writeHead(204, commonHeaders);
        response.end();
        return;
      }
      if (pathname === "/api/test/client-error") {
        response.writeHead(404, commonHeaders);
      } else if (pathname === "/api/test/server-error") {
        response.writeHead(500, commonHeaders);
      } else {
        response.writeHead(200, commonHeaders);
      }
      response.end("{}");
    });
    webServer = createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      const pathname = new URL(request.url ?? "/", "http://test").pathname;
      const scripts =
        pathname === "/diagnostics"
          ? `<script>
              console.warn("token=warning-secret");
              console.error("request failed https://example.com/api?token=url-secret");
              setTimeout(() => { throw new Error("page failure secret=page-secret"); });
              fetch(${JSON.stringify(`${apiOrigin}/api/test/ok?token=ok-secret`)});
              fetch(${JSON.stringify(`${apiOrigin}/api/test/client-error?token=client-secret`)});
              fetch(${JSON.stringify(`${apiOrigin}/api/test/server-error?token=server-secret`)}, {
                method: "POST",
                headers: {
                  Authorization: "Bearer header-secret",
                  "Content-Type": "application/json"
                },
                body: JSON.stringify({ credential: "body-secret" })
              });
              fetch("http://127.0.0.1:9/unavailable?token=failure-secret").catch(() => {});
            </script>`
          : pathname === "/delayed"
            ? `<script>setTimeout(() => fetch(${JSON.stringify(`${apiOrigin}/api/test/ok`)}), 200);</script>`
            : pathname === "/busy"
              ? `<script>setInterval(() => fetch(${JSON.stringify(`${apiOrigin}/api/test/ok`)}), 100);</script>`
              : "";
      response.end(`<!doctype html>
        <html><body>
          <h1>Test page</h1>
          <label>金額<input value=""></label>
          <label>出金元の財布<select><option>財布A</option><option>財布B</option></select></label>
          <div role="combobox" aria-label="custom selector">custom</div>
          <a href="/records">E2E 出金作成 ¥1,200</a>
          ${scripts}
        </body></html>`);
    });
    apiOrigin = await listen(apiServer);
    webOrigin = await listen(webServer);
  });

  afterAll(async () => {
    await Promise.all([close(apiServer), close(webServer)]);
    await rm(artifactRoot, { force: true, recursive: true });
  });

  it("同じsessionのpageを操作し、new-sessionでcontextを初期化する", async () => {
    const manager = new BrowserManager(
      testConfig({ apiOrigin, artifactRoot, webOrigin }),
    );

    try {
      const first = await manager.createAuthenticatedSession();
      expect(first.url).toBe("/home");
      expect(await manager.typeByLabel("金額", "1200")).toBe("1200");
      expect(await manager.selectByLabel("出金元の財布", "財布B")).toBe(
        "財布B",
      );

      const snapshot = await manager.snapshot();
      expect(snapshot.elements).toEqual(
        expect.arrayContaining([
          { name: "Test page", role: "heading" },
          { name: "金額", role: "textbox", value: "1200" },
          {
            name: "出金元の財布",
            role: "combobox",
            value: "財布B",
          },
          { name: "E2E 出金作成 ¥1,200", role: "link" },
        ]),
      );

      const second = await manager.createAuthenticatedSession();
      expect(second.session).not.toBe(first.session);
      expect((await manager.snapshot()).elements).toContainEqual({
        name: "金額",
        role: "textbox",
        value: "",
      });
    } finally {
      await manager.stop();
    }
  }, 20_000);

  it("selectはnative select以外を拒否する", async () => {
    const manager = new BrowserManager(
      testConfig({ apiOrigin, artifactRoot, webOrigin }),
    );
    try {
      await manager.createAuthenticatedSession();
      await expect(
        manager.selectByLabel("custom selector", "anything"),
      ).rejects.toMatchObject({
        code: "INTERACTION_FAILED",
        message: "Phase 1のselectはnative <select>だけを操作できます。",
      });
    } finally {
      await manager.stop();
    }
  });

  it("console error、warning、pageerrorを秘匿化して収集する", async () => {
    const manager = new BrowserManager(
      testConfig({ apiOrigin, artifactRoot, webOrigin }),
    );
    try {
      await manager.createAuthenticatedSession();
      expect(manager.consoleReport()).toEqual({ errors: [], warnings: [] });

      await manager.goto("/diagnostics");
      await manager.waitForSettle();

      expect(manager.consoleReport()).toEqual({
        errors: expect.arrayContaining([
          {
            type: "console.error",
            message: "request failed https://example.com/api",
          },
          {
            type: "pageerror",
            message: "page failure secret=[REDACTED]",
          },
        ]),
        warnings: [{ type: "console.warn", message: "token=[REDACTED]" }],
      });
      expect(manager.consoleReport({ errorsOnly: true })).not.toHaveProperty(
        "warnings",
      );
      expect(JSON.stringify(manager.consoleReport())).not.toMatch(
        /warning-secret|url-secret|page-secret/,
      );
    } finally {
      await manager.stop();
    }
  });

  it("network failureを最小metadataへ集計しsecretを公開しない", async () => {
    const manager = new BrowserManager(
      testConfig({ apiOrigin, artifactRoot, webOrigin }),
    );
    try {
      await manager.createAuthenticatedSession();
      await manager.goto("/diagnostics");
      await manager.waitForSettle();

      const summary = manager.networkSummary();
      expect(summary.total).toBeGreaterThanOrEqual(5);
      expect(summary.failed).toBe(3);
      expect(summary.clientErrors).toContainEqual({
        method: "GET",
        path: "/api/test/client-error",
        status: 404,
      });
      expect(summary.serverErrors).toContainEqual({
        method: "POST",
        path: "/api/test/server-error",
        status: 500,
      });
      expect(summary.requestFailures).toContainEqual({
        method: "GET",
        origin: "http://127.0.0.1:9",
        failureReason: expect.any(String),
      });
      expect(JSON.stringify(summary)).not.toMatch(
        /header-secret|body-secret|client-secret|server-secret|failure-secret|authorization|cookie/i,
      );
    } finally {
      await manager.stop();
    }
  });

  it("new-sessionでconsoleとnetwork情報をresetする", async () => {
    const manager = new BrowserManager(
      testConfig({ apiOrigin, artifactRoot, webOrigin }),
    );
    try {
      await manager.createAuthenticatedSession();
      await manager.goto("/diagnostics");
      await manager.waitForSettle();
      expect(manager.consoleReport().errors.length).toBeGreaterThan(0);
      expect(manager.networkSummary().failed).toBeGreaterThan(0);

      await manager.createAuthenticatedSession();
      expect(manager.consoleReport()).toEqual({ errors: [], warnings: [] });
      expect(manager.networkSummary().failed).toBe(0);
    } finally {
      await manager.stop();
    }
  });

  it("最後のnetwork activityから300ms待ってsettleする", async () => {
    const manager = new BrowserManager(
      testConfig({ apiOrigin, artifactRoot, webOrigin }),
    );
    try {
      await manager.createAuthenticatedSession();
      await manager.goto("/delayed");
      const result = await manager.waitForSettle();
      expect(result.settled).toBe(true);
      expect(result.waitedMs).toBeGreaterThanOrEqual(450);
    } finally {
      await manager.stop();
    }
  });

  it("network activityが継続する場合は5秒でtimeoutする", async () => {
    const manager = new BrowserManager(
      testConfig({ apiOrigin, artifactRoot, webOrigin }),
    );
    try {
      await manager.createAuthenticatedSession();
      await manager.goto("/busy");
      await expect(manager.waitForSettle()).rejects.toMatchObject({
        code: "SETTLE_TIMEOUT",
      });
    } finally {
      await manager.stop();
    }
  }, 10_000);

  it("session未作成ではwait-settleを拒否する", async () => {
    const manager = new BrowserManager(
      testConfig({ apiOrigin, artifactRoot, webOrigin }),
    );
    await expect(manager.waitForSettle()).rejects.toMatchObject({
      code: "SESSION_NOT_FOUND",
    });
  });
});

function testConfig(
  overrides: Pick<
    AgentControlConfig,
    "apiOrigin" | "artifactRoot" | "webOrigin"
  >,
): AgentControlConfig {
  return {
    ...overrides,
    daemonHost: "127.0.0.1",
    daemonLogPath: path.join(overrides.artifactRoot, "daemon.log"),
    daemonPort: 4317,
    environment: "development",
    repoRoot: overrides.artifactRoot,
    verificationPassword: "password",
    verificationUserEmail: "verification@example.test",
  };
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("missing port");
  return `http://127.0.0.1:${address.port}`;
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
