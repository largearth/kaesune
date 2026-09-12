import { config } from "dotenv";
import { hashPassword } from "better-auth/crypto";

import { createDb } from "./client";
import {
  accounts,
  allocations,
  claimItems,
  claims,
  groupMembers,
  groups,
  users,
  wallets,
  withdrawals,
} from "./schema";

config({ path: process.env.OKAESHI_ENV_FILE ?? ".dev.vars" });

const required = (value: string | undefined, name: string) => {
  if (!value) {
    throw new Error(`${name} must be configured before running verification`);
  }

  return value;
};

if (process.env.ENVIRONMENT !== "development") {
  throw new Error(
    "Verification fixtures can only be created with ENVIRONMENT=development",
  );
}

const databaseUrl = required(process.env.DATABASE_URL, "DATABASE_URL");
const verificationUser = {
  id: "7a60140c-6060-4a84-b3d8-6e0571554db8",
  name: process.env.VERIFY_USER_NAME ?? "Verification user",
  email: (
    process.env.VERIFY_USER_EMAIL ?? "verification@example.test"
  ).toLowerCase(),
  password:
    process.env.VERIFY_USER_PASSWORD ?? "verify-records-delete-password",
};
const debtorUser = {
  id: "9527052c-97ab-47f2-9766-1e36da52423e",
  name: "E2E 請求対象",
  email: "invoices-debtor@example.test",
};
const verificationGroup = {
  id: "de086a07-0c9c-4a2a-bf75-029c7d0df01d",
  name: process.env.VERIFY_GROUP_NAME ?? "E2E verification household",
};
const actorMemberId = "280e9f97-5c9d-4d7b-9c73-a44d7636b3c9";
const debtorMemberId = "27b85464-02e4-48df-bf99-9b41ae3c82f0";
const walletId = "5576fb72-4c68-4e0f-8525-952793d13e64";
const unsettledWithdrawalId = "08ddbb4c-8de4-4641-8864-672e24d4c87f";
const unsettledExtraWithdrawalId = "e1ef2098-abd1-4732-a8d7-34d1345a5bb2";
const settledWithdrawalId = "2f136467-03e3-49aa-8535-b9069300b02e";
const unsettledAllocationId = "9d7ea6e4-6ed7-4a8a-bfdc-ce06fc381a01";
const unsettledExtraAllocationId = "6eb0bb1a-645d-477a-b7cc-0c561659e7b1";
const settledAllocationId = "0d543c35-2604-481d-ac99-37c021725ba4";
const unsettledClaimId = "46a25fc6-9043-44d2-88ee-27232a728b53";
const settledClaimId = "d7a28546-9003-4ef3-bf3f-1e198819cdcb";
const unsettledClaimItemId = "25e96c7a-b214-4c43-8763-b0cc63455a41";
const unsettledExtraClaimItemId = "70224390-19fd-45da-ad34-e963b6138906";
const settledClaimItemId = "085aa2fb-477f-40bc-a789-bd225d727395";

const db = createDb(databaseUrl);

const seed = async () => {
  const passwordHash = await hashPassword(verificationUser.password);

  await db
    .insert(users)
    .values({
      id: verificationUser.id,
      name: verificationUser.name,
      email: verificationUser.email,
      emailVerified: true,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        name: verificationUser.name,
        email: verificationUser.email,
        emailVerified: true,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(accounts)
    .values({
      userId: verificationUser.id,
      providerId: "credential",
      accountId: verificationUser.id,
      password: passwordHash,
    })
    .onConflictDoUpdate({
      target: [accounts.providerId, accounts.accountId],
      set: { password: passwordHash, updatedAt: new Date() },
    });

  await db
    .insert(users)
    .values({
      id: debtorUser.id,
      name: debtorUser.name,
      email: debtorUser.email,
      emailVerified: true,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        name: debtorUser.name,
        email: debtorUser.email,
        emailVerified: true,
        updatedAt: new Date(),
      },
    });

  await db
    .insert(groups)
    .values(verificationGroup)
    .onConflictDoUpdate({
      target: groups.id,
      set: { name: verificationGroup.name, updatedAt: new Date() },
    });

  await db
    .insert(groupMembers)
    .values({
      id: actorMemberId,
      groupId: verificationGroup.id,
      userId: verificationUser.id,
      role: "owner",
      status: "active",
    })
    .onConflictDoUpdate({
      target: groupMembers.id,
      set: { role: "owner", status: "active", leftAt: null },
    });

  await db
    .insert(groupMembers)
    .values({
      id: debtorMemberId,
      groupId: verificationGroup.id,
      userId: debtorUser.id,
      role: "member",
      status: "active",
    })
    .onConflictDoUpdate({
      target: groupMembers.id,
      set: { role: "member", status: "active", leftAt: null },
    });

  await db
    .insert(wallets)
    .values({
      id: walletId,
      groupId: verificationGroup.id,
      name: "E2E 共有口座",
      ownerType: "shared",
    })
    .onConflictDoUpdate({
      target: wallets.id,
      set: {
        name: "E2E 共有口座",
        ownerType: "shared",
        ownerMemberId: null,
        updatedAt: new Date(),
      },
    });

  const verificationWithdrawals: (typeof withdrawals.$inferInsert)[] = [
    {
      id: unsettledWithdrawalId,
      groupId: verificationGroup.id,
      walletId,
      purpose: "E2E 週の食料品",
      amount: 3000n,
      withdrawnOn: "2026-09-10",
      status: "claimed",
    },
    {
      id: unsettledExtraWithdrawalId,
      groupId: verificationGroup.id,
      walletId,
      purpose: "E2E 駐車場代",
      amount: 1250n,
      withdrawnOn: "2026-09-10",
      status: "claimed",
    },
    {
      id: settledWithdrawalId,
      groupId: verificationGroup.id,
      walletId,
      purpose: "E2E 日用品",
      amount: 1500n,
      withdrawnOn: "2026-09-09",
      status: "settled",
    },
  ];
  for (const withdrawal of verificationWithdrawals) {
    await db
      .insert(withdrawals)
      .values(withdrawal)
      .onConflictDoUpdate({
        target: withdrawals.id,
        set: { ...withdrawal, updatedAt: new Date() },
      });
  }

  const verificationAllocations: (typeof allocations.$inferInsert)[] = [
    {
      id: unsettledAllocationId,
      withdrawalId: unsettledWithdrawalId,
      memberId: debtorMemberId,
      amount: 3000n,
    },
    {
      id: unsettledExtraAllocationId,
      withdrawalId: unsettledExtraWithdrawalId,
      memberId: debtorMemberId,
      amount: 1250n,
    },
    {
      id: settledAllocationId,
      withdrawalId: settledWithdrawalId,
      memberId: debtorMemberId,
      amount: 1500n,
    },
  ];
  for (const allocation of verificationAllocations) {
    await db
      .insert(allocations)
      .values(allocation)
      .onConflictDoUpdate({
        target: allocations.id,
        set: { ...allocation, updatedAt: new Date() },
      });
  }

  const settledAt = new Date("2026-09-11T00:00:00.000Z");
  const verificationClaims: (typeof claims.$inferInsert)[] = [
    {
      id: unsettledClaimId,
      groupId: verificationGroup.id,
      debtorMemberId,
      walletId,
      amount: 4250n,
      status: "unsettled",
      settledAt: null,
      createdAt: new Date("2026-09-12T00:00:00.000Z"),
    },
    {
      id: settledClaimId,
      groupId: verificationGroup.id,
      debtorMemberId,
      walletId,
      amount: 1500n,
      status: "settled",
      settledAt,
      createdAt: new Date("2026-09-11T00:00:00.000Z"),
    },
  ];
  for (const claim of verificationClaims) {
    await db
      .insert(claims)
      .values(claim)
      .onConflictDoUpdate({
        target: claims.id,
        set: { ...claim, updatedAt: new Date() },
      });
  }

  const verificationClaimItems: (typeof claimItems.$inferInsert)[] = [
    {
      id: unsettledClaimItemId,
      claimId: unsettledClaimId,
      allocationId: unsettledAllocationId,
      amount: 3000n,
    },
    {
      id: unsettledExtraClaimItemId,
      claimId: unsettledClaimId,
      allocationId: unsettledExtraAllocationId,
      amount: 1250n,
    },
    {
      id: settledClaimItemId,
      claimId: settledClaimId,
      allocationId: settledAllocationId,
      amount: 1500n,
    },
  ];
  for (const claimItem of verificationClaimItems) {
    await db
      .insert(claimItems)
      .values(claimItem)
      .onConflictDoUpdate({
        target: claimItems.id,
        set: { ...claimItem, updatedAt: new Date() },
      });
  }
};

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
