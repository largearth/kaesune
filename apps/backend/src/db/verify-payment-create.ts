import { config } from "dotenv";
import { and, eq } from "drizzle-orm";
import { hashPassword } from "better-auth/crypto";

import { createDb } from "./client";
import {
  accounts,
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
  password: "verify-payment-create-password",
};
const verificationGroup = {
  id: "de086a07-0c9c-4a2a-bf75-029c7d0df01d",
  name: process.env.VERIFY_GROUP_NAME ?? "E2E verification household",
};
const verificationMemberId = "280e9f97-5c9d-4d7b-9c73-a44d7636b3c9";
const verificationWalletId = "df0592ef-ae1f-4469-9edf-ad0f93488675";
const createdWithdrawalPurpose = "E2E 出金作成";

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
    .insert(groups)
    .values(verificationGroup)
    .onConflictDoUpdate({
      target: groups.id,
      set: { name: verificationGroup.name, updatedAt: new Date() },
    });

  await db
    .insert(groupMembers)
    .values({
      id: verificationMemberId,
      groupId: verificationGroup.id,
      userId: verificationUser.id,
      role: "owner",
      status: "active",
    })
    .onConflictDoUpdate({
      target: [groupMembers.groupId, groupMembers.userId],
      set: { role: "owner", status: "active", leftAt: null },
    });

  await db
    .insert(wallets)
    .values({
      id: verificationWalletId,
      groupId: verificationGroup.id,
      name: "E2E 出金作成用財布",
      ownerType: "shared",
    })
    .onConflictDoUpdate({
      target: wallets.id,
      set: {
        name: "E2E 出金作成用財布",
        ownerType: "shared",
        ownerMemberId: null,
      },
    });

  await db
    .delete(withdrawals)
    .where(
      and(
        eq(withdrawals.groupId, verificationGroup.id),
        eq(withdrawals.purpose, createdWithdrawalPurpose),
      ),
    );
};

seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
