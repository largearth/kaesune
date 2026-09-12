import { expect, test } from "@playwright/test";

const webOrigin = process.env.VERIFY_WEB_ORIGIN ?? "http://localhost:5173";
const apiOrigin = process.env.VERIFY_API_ORIGIN ?? "http://localhost:8787";
const currentMemberId = "280e9f97-5c9d-4d7b-9c73-a44d7636b3c9";

test.use({ viewport: { width: 393, height: 852 } });

test("ホームにログインユーザー宛ての未精算請求の合計と件数を表示する", async ({
  page,
}) => {
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

  await page.route(/\/api\/groups\/[^/]+\/claims$/, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        claims: [
          {
            id: "00000000-0000-4000-8000-000000000001",
            groupId: "de086a07-0c9c-4a2a-bf75-029c7d0df01d",
            debtorMemberId: currentMemberId,
            debtorMemberName: "Verification user",
            walletId: "5576fb72-4c68-4e0f-8525-952793d13e64",
            walletName: "E2E 共有口座",
            amount: "1250",
            status: "unsettled",
            settledAt: null,
            createdAt: "2026-09-12T00:00:00.000Z",
            updatedAt: "2026-09-12T00:00:00.000Z",
            items: [],
          },
          {
            id: "00000000-0000-4000-8000-000000000002",
            groupId: "de086a07-0c9c-4a2a-bf75-029c7d0df01d",
            debtorMemberId: currentMemberId,
            debtorMemberName: "Verification user",
            walletId: "5576fb72-4c68-4e0f-8525-952793d13e64",
            walletName: "E2E 共有口座",
            amount: "750",
            status: "unsettled",
            settledAt: null,
            createdAt: "2026-09-12T00:00:00.000Z",
            updatedAt: "2026-09-12T00:00:00.000Z",
            items: [],
          },
          {
            id: "00000000-0000-4000-8000-000000000003",
            groupId: "de086a07-0c9c-4a2a-bf75-029c7d0df01d",
            debtorMemberId: currentMemberId,
            debtorMemberName: "Verification user",
            walletId: "5576fb72-4c68-4e0f-8525-952793d13e64",
            walletName: "E2E 共有口座",
            amount: "1500",
            status: "settled",
            settledAt: "2026-09-12T00:00:00.000Z",
            createdAt: "2026-09-12T00:00:00.000Z",
            updatedAt: "2026-09-12T00:00:00.000Z",
            items: [],
          },
          {
            id: "00000000-0000-4000-8000-000000000004",
            groupId: "de086a07-0c9c-4a2a-bf75-029c7d0df01d",
            debtorMemberId: "27b85464-02e4-48df-bf99-9b41ae3c82f0",
            debtorMemberName: "E2E 請求対象",
            walletId: "5576fb72-4c68-4e0f-8525-952793d13e64",
            walletName: "E2E 共有口座",
            amount: "900",
            status: "unsettled",
            settledAt: null,
            createdAt: "2026-09-12T00:00:00.000Z",
            updatedAt: "2026-09-12T00:00:00.000Z",
            items: [],
          },
        ],
      }),
    });
  });

  await page.goto(`${webOrigin}/home`);

  await expect(page.getByText("請求総額")).toBeVisible();
  await expect(page.getByText("¥2,000")).toBeVisible();
  await expect(page.getByText("2件の請求が未精算です")).toBeVisible();
  await page.screenshot({
    path: "verification-artifacts/home-claim-summary.png",
    fullPage: true,
  });
});
