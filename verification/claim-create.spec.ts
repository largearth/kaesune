import { expect, test } from "@playwright/test";

const webOrigin = process.env.VERIFY_WEB_ORIGIN ?? "http://localhost:5173";
const apiOrigin = process.env.VERIFY_API_ORIGIN ?? "http://localhost:8787";
const withdrawalId = "b497aabe-1d9b-4de2-a05d-49c7e099ab6f";

test.use({ viewport: { width: 393, height: 852 } });

test("請求発行画面で請求を作成し、請求一覧へ遷移する", async ({ page }) => {
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
  await page.goto(`${webOrigin}/records/${withdrawalId}/claims/new`);
  await expect(
    page.getByRole("heading", { name: "負担を割り当てる" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "請求を発行する" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "＝ 均等にする" }).click();
  await expect(
    page.getByRole("textbox", { name: "Verification userの負担額" }),
  ).toHaveValue("500");
  await page.getByRole("button", { name: "E2E 請求作成対象が全額" }).click();
  await expect(
    page.getByRole("textbox", { name: "Verification userの負担額" }),
  ).toHaveValue("0");
  await expect(
    page.getByRole("textbox", { name: "E2E 請求作成対象の負担額" }),
  ).toHaveValue("1000");
  await page
    .getByRole("textbox", { name: "E2E 請求作成対象の負担額" })
    .fill("900");
  await expect(
    page.getByRole("button", { name: "請求を発行する" }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Verification userの負担額" })
    .fill("100");
  await expect(
    page.getByRole("button", { name: "請求を発行する" }),
  ).toBeEnabled();
  await page.screenshot({
    path: "verification-artifacts/claim-create-before.png",
    fullPage: true,
  });
  const allocationResponsePromise = page.waitForResponse((response) =>
    /\/api\/groups\/[^/]+\/withdrawals\/[^/]+\/allocations$/.test(
      new URL(response.url()).pathname,
    ),
  );
  const claimResponsePromise = page.waitForResponse((response) =>
    /\/api\/groups\/[^/]+\/withdrawals\/[^/]+\/claims$/.test(
      new URL(response.url()).pathname,
    ),
  );
  await page.getByRole("button", { name: "請求を発行する" }).click();
  await expect(
    page.getByRole("button", { name: "請求を発行中…" }),
  ).toBeDisabled();
  expect((await allocationResponsePromise).status()).toBe(200);
  expect((await claimResponsePromise).status()).toBe(201);
  await page.waitForURL("**/invoices");
  await expect(page.getByRole("heading", { name: "請求一覧" })).toBeVisible();
  await expect(
    page.getByText("E2E 請求作成対象さんへの請求").first(),
  ).toBeVisible();
  await expect(page.getByText("E2E 請求作成用出金").first()).toBeVisible();
  await expect(
    page.getByText("返済先: E2E 請求作成用共有財布").first(),
  ).toBeVisible();
  await expect(page.getByText("¥100").first()).toBeVisible();
  await expect(page.getByText("¥900").first()).toBeVisible();
  await expect(page.getByText("未精算").first()).toBeVisible();
  await page.screenshot({
    path: "verification-artifacts/claim-create-after.png",
    fullPage: true,
  });
  expect(consoleErrors).toEqual([]);
});
