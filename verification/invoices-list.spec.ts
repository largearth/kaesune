import { expect, test } from "@playwright/test";

const webOrigin = process.env.VERIFY_WEB_ORIGIN ?? "http://localhost:5173";
const apiOrigin = process.env.VERIFY_API_ORIGIN ?? "http://localhost:8787";

test.use({ viewport: { width: 393, height: 852 } });

test("保存済みの請求を一覧表示し、状態で絞り込める", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const signInResponse = await page.request.post(
    `${apiOrigin}/api/auth/sign-in/email`,
    {
      data: {
        email: process.env.VERIFY_USER_EMAIL ?? "verification@example.test",
        password:
          process.env.VERIFY_USER_PASSWORD ?? "verify-records-delete-password",
        callbackURL: `${webOrigin}/home`,
      },
    },
  );
  expect(signInResponse.status(), await signInResponse.text()).toBe(200);

  const claimsResponsePromise = page.waitForResponse((response) =>
    /\/api\/groups\/[^/]+\/claims$/.test(new URL(response.url()).pathname),
  );
  await page.goto(`${webOrigin}/invoices`);
  const claimsResponse = await claimsResponsePromise;
  expect(claimsResponse.status()).toBe(200);
  await expect(claimsResponse.json()).resolves.toMatchObject({
    claims: expect.arrayContaining([
      expect.objectContaining({
        debtorMemberName: "E2E 請求対象",
        walletName: "E2E 共有口座",
        items: expect.arrayContaining([
          expect.objectContaining({ purpose: "E2E 週の食料品" }),
          expect.objectContaining({ purpose: "E2E 駐車場代" }),
        ]),
      }),
    ]),
  });

  await expect(page.getByRole("heading", { name: "請求一覧" })).toBeVisible();
  await expect(
    page.getByText("E2E 請求対象さんへの請求").first(),
  ).toBeVisible();
  await expect(page.getByText("E2E 週の食料品、E2E 駐車場代")).toBeVisible();
  await expect(page.getByText("E2E 日用品")).toBeVisible();
  await expect(page.getByText("返済先: E2E 共有口座").first()).toBeVisible();
  await expect(page.getByText("¥4,250")).toBeVisible();
  await expect(page.getByText("¥1,500")).toBeVisible();
  await page.getByRole("link", { name: /E2E 週の食料品/ }).click();
  await expect(
    page.getByRole("heading", { name: "E2E 請求対象さんへの請求" }),
  ).toBeVisible();
  await expect(page.getByText("請求の内訳")).toBeVisible();
  await expect(page.getByText("E2E 週の食料品")).toBeVisible();
  await expect(page.getByText("E2E 駐車場代")).toBeVisible();
  await expect(page.getByText("返済先")).toBeVisible();
  await expect(page.getByLabel("精算を完了する")).not.toBeChecked();
  await page.getByLabel("精算を完了する").click();
  await expect(page.getByText("精算が完了しました")).toBeVisible();
  await page.screenshot({
    path: "verification-artifacts/invoice-detail-completed.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "請求一覧へ戻る" }).click();
  await page.screenshot({
    path: "verification-artifacts/invoices-list-all.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "未精算" }).click();
  await expect(page.getByText("E2E 週の食料品、E2E 駐車場代")).toBeVisible();
  await expect(page.getByText("E2E 日用品")).toHaveCount(0);

  await page.getByRole("button", { name: "精算済み" }).click();
  await expect(page.getByText("E2E 週の食料品、E2E 駐車場代")).toHaveCount(0);
  await expect(page.getByText("E2E 日用品")).toBeVisible();
  await page.screenshot({
    path: "verification-artifacts/invoices-list-settled.png",
    fullPage: true,
  });

  await page.getByRole("button", { name: "すべて" }).click();
  await expect(page.getByText("E2E 週の食料品、E2E 駐車場代")).toBeVisible();
  await expect(page.getByText("E2E 日用品")).toBeVisible();
  expect(consoleErrors).toEqual([]);
});
