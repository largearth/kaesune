import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
};

export const groups = pgTable("groups", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  ...timestamps,
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    googleSubject: text("google_subject").unique(),
    avatarUrl: text("avatar_url"),
    ...timestamps,
  },
  (table) => [
    check(
      "users_email_lowercase_check",
      sql`${table.email} = lower(${table.email})`,
    ),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    ...timestamps,
  },
  (table) => [index("sessions_user_id_index").on(table.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    idToken: text("id_token"),
    password: text("password"),
    ...timestamps,
  },
  (table) => [
    unique("accounts_provider_id_account_id_key").on(
      table.providerId,
      table.accountId,
    ),
    index("accounts_user_id_index").on(table.userId),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (table) => [index("verifications_identifier_index").on(table.identifier)],
);

export const groupMembers = pgTable(
  "group_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    status: text("status").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    leftAt: timestamp("left_at", { withTimezone: true }),
  },
  (table) => [
    unique("group_members_group_id_user_id_key").on(
      table.groupId,
      table.userId,
    ),
    check(
      "group_members_role_check",
      sql`${table.role} IN ('owner', 'member')`,
    ),
    check(
      "group_members_status_check",
      sql`${table.status} IN ('active', 'left')`,
    ),
  ],
);

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    ownerMemberId: uuid("owner_member_id").references(() => groupMembers.id),
    name: text("name").notNull(),
    ownerType: text("owner_type").notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      "wallets_owner_type_check",
      sql`${table.ownerType} IN ('personal', 'shared')`,
    ),
    check(
      "wallets_owner_member_check",
      sql`(${table.ownerType} = 'personal' AND ${table.ownerMemberId} IS NOT NULL) OR (${table.ownerType} = 'shared' AND ${table.ownerMemberId} IS NULL)`,
    ),
  ],
);

export const withdrawals = pgTable(
  "withdrawals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    purpose: text("purpose").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    withdrawnOn: date("withdrawn_on", { mode: "string" }).notNull(),
    note: text("note"),
    status: text("status").notNull(),
    ...timestamps,
  },
  (table) => [
    check("withdrawals_amount_check", sql`${table.amount} > 0`),
    check(
      "withdrawals_status_check",
      sql`${table.status} IN ('unallocated', 'allocated', 'claimed', 'settled')`,
    ),
    index("withdrawals_group_id_withdrawn_on_index").on(
      table.groupId,
      table.withdrawnOn.desc(),
    ),
  ],
);

export const allocations = pgTable(
  "allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    withdrawalId: uuid("withdrawal_id")
      .notNull()
      .references(() => withdrawals.id),
    memberId: uuid("member_id")
      .notNull()
      .references(() => groupMembers.id),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("allocations_withdrawal_id_member_id_key").on(
      table.withdrawalId,
      table.memberId,
    ),
    check("allocations_amount_check", sql`${table.amount} >= 0`),
    index("allocations_withdrawal_id_index").on(table.withdrawalId),
  ],
);

export const claims = pgTable(
  "claims",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    debtorMemberId: uuid("debtor_member_id")
      .notNull()
      .references(() => groupMembers.id),
    walletId: uuid("wallet_id")
      .notNull()
      .references(() => wallets.id, { onDelete: "restrict" }),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    status: text("status").notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    check("claims_amount_check", sql`${table.amount} > 0`),
    check(
      "claims_status_check",
      sql`${table.status} IN ('unsettled', 'settled')`,
    ),
    index("claims_debtor_member_id_status_created_at_index").on(
      table.debtorMemberId,
      table.status,
      table.createdAt.desc(),
    ),
    index("claims_wallet_id_status_index").on(table.walletId, table.status),
  ],
);

export const claimItems = pgTable(
  "claim_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    claimId: uuid("claim_id")
      .notNull()
      .references(() => claims.id),
    allocationId: uuid("allocation_id")
      .notNull()
      .references(() => allocations.id),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    ...timestamps,
  },
  (table) => [
    unique("claim_items_allocation_id_key").on(table.allocationId),
    check("claim_items_amount_check", sql`${table.amount} > 0`),
    index("claim_items_claim_id_index").on(table.claimId),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => groups.id),
    actorMemberId: uuid("actor_member_id")
      .notNull()
      .references(() => groupMembers.id),
    type: text("type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("activities_group_id_created_at_index").on(
      table.groupId,
      table.createdAt.desc(),
    ),
  ],
);

export const groupsRelations = relations(groups, ({ many }) => ({
  members: many(groupMembers),
  wallets: many(wallets),
  withdrawals: many(withdrawals),
  claims: many(claims),
  activities: many(activities),
}));

export const usersRelations = relations(users, ({ many }) => ({
  memberships: many(groupMembers),
  sessions: many(sessions),
  accounts: many(accounts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
  }),
}));

export const groupMembersRelations = relations(
  groupMembers,
  ({ many, one }) => ({
    group: one(groups, {
      fields: [groupMembers.groupId],
      references: [groups.id],
    }),
    user: one(users, {
      fields: [groupMembers.userId],
      references: [users.id],
    }),
    ownedWallets: many(wallets),
    allocations: many(allocations),
    claims: many(claims),
    activities: many(activities),
  }),
);

export const walletsRelations = relations(wallets, ({ many, one }) => ({
  group: one(groups, {
    fields: [wallets.groupId],
    references: [groups.id],
  }),
  ownerMember: one(groupMembers, {
    fields: [wallets.ownerMemberId],
    references: [groupMembers.id],
  }),
  withdrawals: many(withdrawals),
  claims: many(claims),
}));

export const withdrawalsRelations = relations(withdrawals, ({ many, one }) => ({
  group: one(groups, {
    fields: [withdrawals.groupId],
    references: [groups.id],
  }),
  wallet: one(wallets, {
    fields: [withdrawals.walletId],
    references: [wallets.id],
  }),
  allocations: many(allocations),
}));

export const allocationsRelations = relations(allocations, ({ many, one }) => ({
  withdrawal: one(withdrawals, {
    fields: [allocations.withdrawalId],
    references: [withdrawals.id],
  }),
  member: one(groupMembers, {
    fields: [allocations.memberId],
    references: [groupMembers.id],
  }),
  claimItems: many(claimItems),
}));

export const claimsRelations = relations(claims, ({ many, one }) => ({
  group: one(groups, {
    fields: [claims.groupId],
    references: [groups.id],
  }),
  debtorMember: one(groupMembers, {
    fields: [claims.debtorMemberId],
    references: [groupMembers.id],
  }),
  wallet: one(wallets, {
    fields: [claims.walletId],
    references: [wallets.id],
  }),
  items: many(claimItems),
}));

export const claimItemsRelations = relations(claimItems, ({ one }) => ({
  claim: one(claims, {
    fields: [claimItems.claimId],
    references: [claims.id],
  }),
  allocation: one(allocations, {
    fields: [claimItems.allocationId],
    references: [allocations.id],
  }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  group: one(groups, {
    fields: [activities.groupId],
    references: [groups.id],
  }),
  actorMember: one(groupMembers, {
    fields: [activities.actorMemberId],
    references: [groupMembers.id],
  }),
}));
