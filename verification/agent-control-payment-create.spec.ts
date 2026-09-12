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

test("Agent Controlだけで出金を1件作成しsnapshotとscreenshotを取得できる", async () => {
  const session = await runCli(["new-session"]);
  expect(session).toMatchObject({ ok: true, url: "/home" });

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

  let formSnapshot: Record<string, unknown> = {};
  await expect
    .poll(
      async () => {
        formSnapshot = await runCli(["snapshot"]);
        return JSON.stringify(formSnapshot);
      },
      { timeout: 10_000 },
    )
    .toContain("出金元の財布");
  expect(JSON.stringify(formSnapshot)).toContain("出金を記録する");
  expect(JSON.stringify(formSnapshot)).toContain("金額");

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
  ).toMatchObject({
    ok: true,
    label: "用途",
    value: "E2E 出金作成",
  });
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

  let recordsSnapshot: Record<string, unknown> = {};
  await expect
    .poll(
      async () => {
        recordsSnapshot = await runCli(["snapshot"]);
        return JSON.stringify(recordsSnapshot);
      },
      { timeout: 10_000 },
    )
    .toContain("E2E 出金作成");
  const serializedSnapshot = JSON.stringify(recordsSnapshot);
  expect(serializedSnapshot).toContain("¥1,200");
  expect(recordsSnapshot).toMatchObject({ ok: true, url: "/records" });

  const matchingRecords = (
    recordsSnapshot.elements as Array<{ name: string; role: string }>
  ).filter(
    (element) =>
      element.role === "link" && element.name.includes("E2E 出金作成"),
  );
  expect(matchingRecords).toHaveLength(1);

  const screenshot = await runCli(["screenshot"]);
  expect(screenshot).toMatchObject({ ok: true, url: "/records" });
  const screenshotPath = path.join(repoRoot, String(screenshot.path));
  expect((await stat(screenshotPath)).size).toBeGreaterThan(0);
});
