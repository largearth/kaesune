import { config } from "dotenv";
import { eq, inArray } from "drizzle-orm";
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
  if (!value)
    throw new Error(`${name} must be configured before running verification`);
  return value;
};

if (process.env.ENVIRONMENT !== "development") {
  throw new Error(
    "Verification fixtures can only be created with ENVIRONMENT=development",
  );
}

const db = createDb(required(process.env.DATABASE_URL, "DATABASE_URL"));
const user = {
  id: "7a60140c-6060-4a84-b3d8-6e0571554db8",
  name: process.env.VERIFY_USER_NAME ?? "Verification user",
  email: (
    process.env.VERIFY_USER_EMAIL ?? "verification@example.test"
  ).toLowerCase(),
  password:
    process.env.VERIFY_USER_PASSWORD ?? "verify-records-delete-password",
};
const debtor = {
  id: "9527052c-97ab-47f2-9766-1e36da52423e",
  name: "E2E 請求作成対象",
  email: "claim-create-debtor@example.test",
};
const group = {
  id: "de086a07-0c9c-4a2a-bf75-029c7d0df01d",
  name: process.env.VERIFY_GROUP_NAME ?? "E2E verification household",
};
const actorMemberId = "280e9f97-5c9d-4d7b-9c73-a44d7636b3c9";
const debtorMemberId = "27b85464-02e4-48df-bf99-9b41ae3c82f0";
const walletId = "dfe0d833-b13e-4d17-a84c-978e044a5afb";
const withdrawalId = "b497aabe-1d9b-4de2-a05d-49c7e099ab6f";

const seed = async () => {
  const passwordHash = await hashPassword(user.password);
  await db
    .insert(users)
    .values({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: true,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        name: user.name,
        email: user.email,
        emailVerified: true,
        updatedAt: new Date(),
      },
    });
  await db
    .insert(accounts)
    .values({
      userId: user.id,
      providerId: "credential",
      accountId: user.id,
      password: passwordHash,
    })
    .onConflictDoUpdate({
      target: [accounts.providerId, accounts.accountId],
      set: { password: passwordHash, updatedAt: new Date() },
    });
  await db
    .insert(users)
    .values({
      id: debtor.id,
      name: debtor.name,
      email: debtor.email,
      emailVerified: true,
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        name: debtor.name,
        email: debtor.email,
        emailVerified: true,
        updatedAt: new Date(),
      },
    });
  await db
    .insert(groups)
    .values(group)
    .onConflictDoUpdate({
      target: groups.id,
      set: { name: group.name, updatedAt: new Date() },
    });
  for (const member of [
    { id: actorMemberId, userId: user.id, role: "owner" as const },
    { id: debtorMemberId, userId: debtor.id, role: "member" as const },
  ]) {
    await db
      .insert(groupMembers)
      .values({ ...member, groupId: group.id, status: "active" })
      .onConflictDoUpdate({
        target: groupMembers.id,
        set: { role: member.role, status: "active", leftAt: null },
      });
  }
  await db
    .insert(wallets)
    .values({
      id: walletId,
      groupId: group.id,
      name: "E2E 請求作成用共有財布",
      ownerType: "shared",
    })
    .onConflictDoUpdate({
      target: wallets.id,
      set: {
        name: "E2E 請求作成用共有財布",
        ownerType: "shared",
        ownerMemberId: null,
        updatedAt: new Date(),
      },
    });
  const allocationRows = await db
    .select({ id: allocations.id })
    .from(allocations)
    .where(eq(allocations.withdrawalId, withdrawalId));
  const allocationIds = allocationRows.map((row) => row.id);
  if (allocationIds.length > 0) {
    const itemRows = await db
      .select({ claimId: claimItems.claimId })
      .from(claimItems)
      .where(inArray(claimItems.allocationId, allocationIds));
    const claimIds = [...new Set(itemRows.map((row) => row.claimId))];
    await db
      .delete(claimItems)
      .where(inArray(claimItems.allocationId, allocationIds));
    if (claimIds.length > 0)
      await db.delete(claims).where(inArray(claims.id, claimIds));
    await db.delete(allocations).where(inArray(allocations.id, allocationIds));
  }
  await db
    .insert(withdrawals)
    .values({
      id: withdrawalId,
      groupId: group.id,
      walletId,
      purpose: "E2E 請求作成用出金",
      amount: 1000n,
      withdrawnOn: "2026-09-12",
      status: "unallocated",
    })
    .onConflictDoUpdate({
      target: withdrawals.id,
      set: {
        walletId,
        purpose: "E2E 請求作成用出金",
        amount: 1000n,
        withdrawnOn: "2026-09-12",
        status: "unallocated",
        updatedAt: new Date(),
      },
    });
};

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
