import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  runAgentControlCli as runCli,
  startAgentControlDaemon,
  stopAgentControlDaemon,
} from "./support/agent-control";

const repoRoot = process.cwd();
let daemon: ChildProcessWithoutNullStreams;

test.beforeAll(async () => {
  daemon = await startAgentControlDaemon();
});

test.afterAll(async () => {
  await stopAgentControlDaemon(daemon);
});

test("Agent Control Phase 2で出金作成結果と失敗理由を観測できる", async ({}, testInfo) => {
  const doctor = await runCli(["doctor"]);
  expect(doctor).toEqual({
    ok: true,
    checks: {
      daemon: { ok: true },
      frontend: { ok: true, url: "http://localhost:5173" },
      backend: { ok: true, url: "http://localhost:8787" },
      browser: { ok: true },
    },
  });

  expect(await runCli(["new-session"])).toMatchObject({
    ok: true,
    url: "/home",
  });
  expect(await runCli(["goto", "/home"])).toMatchObject({
    ok: true,
    url: "/home",
  });
  expect(
    await runCli([
      "click",
      "--role",
      "button",
      "--name",
      "立て替えたお金を記録する",
    ]),
  ).toMatchObject({ ok: true, url: "/home" });
  expect(
    await runCli(["type", "--label", "金額", "--value", "1200"]),
  ).toMatchObject({ ok: true, label: "金額", value: "1,200" });
  expect(
    await runCli([
      "select",
      "--label",
      "出金元の財布",
      "--option",
      "E2E 出金作成用財布",
    ]),
  ).toMatchObject({
    ok: true,
    label: "出金元の財布",
    option: "E2E 出金作成用財布",
  });
  expect(
    await runCli(["type", "--label", "用途", "--value", "E2E 出金作成"]),
  ).toMatchObject({ ok: true, label: "用途", value: "E2E 出金作成" });
  expect(
    await runCli([
      "click",
      "--role",
      "button",
      "--name",
      "出金を記録する",
      "--wait-for-url",
      "/records",
    ]),
  ).toMatchObject({ ok: true, url: "/records" });

  expect(await runCli(["wait-settle"])).toMatchObject({
    ok: true,
    settled: true,
    waitedMs: expect.any(Number),
  });

  const snapshot = await runCli(["snapshot"]);
  expect(snapshot).toMatchObject({ ok: true, url: "/records" });
  expect(JSON.stringify(snapshot)).toContain("E2E 出金作成");
  expect(JSON.stringify(snapshot)).toContain("¥1,200");

  const consoleReport = await runCli(["console", "--errors-only"]);
  expect(consoleReport).toEqual({ ok: true, errors: [] });

  const networkReport = await runCli(["network-summary"]);
  expect(networkReport).toMatchObject({
    ok: true,
    summary: {
      serverErrors: [],
      requestFailures: [],
    },
  });

  const screenshot = await runCli(["screenshot"]);
  expect(screenshot).toMatchObject({ ok: true, url: "/records" });
  const screenshotPath = path.join(repoRoot, String(screenshot.path));
  expect((await stat(screenshotPath)).size).toBeGreaterThan(0);

  await testInfo.attach("doctor.json", {
    body: JSON.stringify(doctor, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("console.json", {
    body: JSON.stringify(consoleReport, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("network-summary.json", {
    body: JSON.stringify(networkReport, null, 2),
    contentType: "application/json",
  });
  await testInfo.attach("screenshot.png", {
    path: screenshotPath,
    contentType: "image/png",
  });
});
