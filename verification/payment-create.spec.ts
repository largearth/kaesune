import { expect, test } from "@playwright/test";

const webOrigin = process.env.VERIFY_WEB_ORIGIN ?? "http://localhost:5173";
const apiOrigin = process.env.VERIFY_API_ORIGIN ?? "http://localhost:8787";

test.use({ viewport: { width: 393, height: 852 } });

const today = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

test("認証済みの状態から出金を作成できる", async ({ page }) => {
  let walletRequestCount = 0;
  page.on("request", (request) => {
    if (
      /\/api\/groups\/[^/]+\/wallets$/.test(new URL(request.url()).pathname)
    ) {
      walletRequestCount += 1;
    }
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

  await page.goto(`${webOrigin}/home`);
  await page.getByRole("button", { name: "立て替えたお金を記録する" }).click();

  const amountInput = page.getByLabel("金額");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(amountInput).toBeFocused();
  await expect(page.getByLabel("日付（任意）")).toHaveValue(today());
  await expect(
    page.getByRole("button", { name: "出金を記録する" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "キャンセル" })).toBeVisible();

  await amountInput.fill("1000");
  await expect(amountInput).toHaveValue("1,000");
  await page.getByLabel("出金元の財布").selectOption({
    label: "E2E 出金作成用財布",
  });
  await expect.poll(() => walletRequestCount).toBe(1);
  await page.getByLabel("用途").fill("E2E 出金作成");
  await page.screenshot({
    path: "verification-artifacts/payment-create-form.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "出金を記録する" }).click();

  await page.waitForURL("**/records");
  await expect(page.getByRole("heading", { name: "Record" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /E2E 出金作成.*¥1,000/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "verification-artifacts/payment-create-after.png",
    fullPage: true,
  });
});
