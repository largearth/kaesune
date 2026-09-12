import { expect, test } from "@playwright/test";

const webOrigin = process.env.VERIFY_WEB_ORIGIN ?? "http://localhost:5173";
const apiOrigin = process.env.VERIFY_API_ORIGIN ?? "http://localhost:8787";

test.use({ viewport: { width: 393, height: 852 } });

test("下部ナビゲーションから請求一覧へ遷移する", async ({ page }) => {
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
  await expect(page.getByRole("link", { name: "請求一覧" })).toHaveAttribute(
    "href",
    "/invoices",
  );
  await expect(page.locator('a[href="/mypage"]')).toBeVisible();
  await page.getByRole("link", { name: "請求一覧" }).click();
  await expect(page).toHaveURL(`${webOrigin}/invoices`);
  await expect(page.getByRole("heading", { name: "請求一覧" })).toBeVisible();
  await page.screenshot({
    path: "verification-artifacts/bottom-nav-invoices.png",
    fullPage: true,
  });
});
