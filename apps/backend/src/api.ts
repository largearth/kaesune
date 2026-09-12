import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { and, asc, desc, eq, inArray } from "drizzle-orm";

import { createAuth, type AuthBindings } from "./auth";
import type { Database } from "./db/client";
import {
  activities,
  allocations,
  claimItems,
  claims,
  groupMembers,
  groups,
  users,
  wallets,
  withdrawals,
} from "./db/schema";

export type ApiEnvironment = {
  Bindings: AuthBindings;
  Variables: { db: Database };
};

const uuid = z.string().uuid();
const amount = z
  .string()
  .regex(/^[1-9][0-9]*$/, "正の円整数を指定してください。");
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const errorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.array(z.string())).optional(),
  })
  .openapi("Error");
const errorResponses = {
  401: {
    content: { "application/json": { schema: errorSchema } },
    description: "Unauthenticated",
  },
  404: {
    content: { "application/json": { schema: errorSchema } },
    description: "Not found",
  },
  409: {
    content: { "application/json": { schema: errorSchema } },
    description: "Conflict",
  },
  422: {
    content: { "application/json": { schema: errorSchema } },
    description: "Validation failed",
  },
} as const;
const memberSchema = z
  .object({
    id: uuid,
    name: z.string(),
    role: z.enum(["owner", "member"]),
    avatarUrl: z.string().nullable(),
  })
  .openapi("Member");
const walletSchema = z
  .object({
    id: uuid,
    groupId: uuid,
    name: z.string(),
    ownerType: z.enum(["personal", "shared"]),
    ownerMemberId: uuid.nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Wallet");
const allocationSchema = z
  .object({ memberId: uuid, amount })
  .openapi("Allocation");
const withdrawalSchema = z
  .object({
    id: uuid,
    groupId: uuid,
    walletId: uuid,
    purpose: z.string(),
    amount,
    withdrawnOn: date,
    note: z.string().nullable(),
    status: z.enum(["unallocated", "allocated", "claimed", "settled"]),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    allocations: z.array(allocationSchema),
  })
  .openapi("Withdrawal");
const claimSchema = z
  .object({
    id: uuid,
    groupId: uuid,
    debtorMemberId: uuid,
    walletId: uuid,
    amount,
    status: z.enum(["unsettled", "settled"]),
    settledAt: z.string().datetime().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .openapi("Claim");

const toAmount = (value: bigint) => value.toString();
const toIso = (value: Date) => value.toISOString();
const noStore = <T>(
  c: { header: (name: string, value: string) => void },
  value: T,
) => {
  c.header("Cache-Control", "no-store");
  return value;
};

class ApiError extends Error {
  constructor(
    readonly status: 401 | 404 | 409 | 422,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const requireMember = async (
  db: Database,
  groupId: string,
  request: Request,
  env: AuthBindings,
) => {
  const session = await createAuth(env).api.getSession({
    headers: request.headers,
  });
  if (!session)
    throw new ApiError(401, "UNAUTHENTICATED", "ログインが必要です。");
  const [member] = await db
    .select({
      id: groupMembers.id,
      userId: groupMembers.userId,
      role: groupMembers.role,
    })
    .from(groupMembers)
    .where(
      and(
        eq(groupMembers.groupId, groupId),
        eq(groupMembers.userId, session.user.id),
        eq(groupMembers.status, "active"),
      ),
    );
  if (!member)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "リソースが見つかりません。");
  return member;
};

const serializeWallet = (row: typeof wallets.$inferSelect) => ({
  ...row,
  ownerType: row.ownerType as "personal" | "shared",
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});
const serializeClaim = (row: typeof claims.$inferSelect) => ({
  ...row,
  status: row.status as "unsettled" | "settled",
  amount: toAmount(row.amount),
  settledAt: row.settledAt?.toISOString() ?? null,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
});

const withdrawalById = async (db: Database, groupId: string, id: string) => {
  const [withdrawal] = await db
    .select()
    .from(withdrawals)
    .where(and(eq(withdrawals.id, id), eq(withdrawals.groupId, groupId)));
  if (!withdrawal)
    throw new ApiError(404, "RESOURCE_NOT_FOUND", "出金が見つかりません。");
  const allocationRows = await db
    .select()
    .from(allocations)
    .where(eq(allocations.withdrawalId, id));
  return {
    ...withdrawal,
    status: withdrawal.status as
      "unallocated" | "allocated" | "claimed" | "settled",
    amount: toAmount(withdrawal.amount),
    createdAt: toIso(withdrawal.createdAt),
    updatedAt: toIso(withdrawal.updatedAt),
    allocations: allocationRows.map((allocation) => ({
      memberId: allocation.memberId,
      amount: toAmount(allocation.amount),
    })),
  };
};

export const api = new OpenAPIHono<ApiEnvironment>({
  defaultHook: (result, c) => {
    if (!result.success)
      return c.json(
        {
          code: "VALIDATION_ERROR",
          message: "入力値が正しくありません。",
          fields: result.error.flatten().fieldErrors,
        },
        422,
      );
  },
});

api.onError((error, c) => {
  if (error instanceof ApiError)
    return c.json({ code: error.code, message: error.message }, error.status);
  console.error(error);
  return c.json(
    { code: "INTERNAL_ERROR", message: "予期しないエラーが発生しました。" },
    500,
  );
});

api.doc("/openapi.json", {
  openapi: "3.0.3",
  info: {
    title: "Okaeshi API",
    version: "1.0.0",
    description: "認証済みグループメンバー向けのREST API",
  },
});
api.get(
  "/docs",
  swaggerUI({ url: "/api/openapi.json", persistAuthorization: true }),
);

api.openapi(
  createRoute({
    method: "get",
    path: "/me",
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              id: uuid,
              name: z.string(),
              email: z.string().email(),
              groups: z.array(
                z.object({ id: uuid, name: z.string(), memberId: uuid }),
              ),
            }),
          },
        },
        description: "Current user",
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const session = await createAuth(c.env).api.getSession({
      headers: c.req.raw.headers,
    });
    if (!session)
      throw new ApiError(401, "UNAUTHENTICATED", "ログインが必要です。");
    const memberships = await c
      .get("db")
      .select({ id: groups.id, name: groups.name, memberId: groupMembers.id })
      .from(groupMembers)
      .innerJoin(groups, eq(groups.id, groupMembers.groupId))
      .where(
        and(
          eq(groupMembers.userId, session.user.id),
          eq(groupMembers.status, "active"),
        ),
      );
    return c.json(
      noStore(c, {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        groups: memberships,
      }),
    );
  },
);

api.openapi(
  createRoute({
    method: "get",
    path: "/groups/{groupId}/members",
    request: { params: z.object({ groupId: uuid }) },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({ members: z.array(memberSchema) }),
          },
        },
        description: "Members",
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { groupId } = c.req.valid("param");
    const db = c.get("db");
    await requireMember(db, groupId, c.req.raw, c.env);
    const members = await db
      .select({
        id: groupMembers.id,
        name: users.name,
        role: groupMembers.role,
        avatarUrl: users.avatarUrl,
      })
      .from(groupMembers)
      .innerJoin(users, eq(users.id, groupMembers.userId))
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.status, "active"),
        ),
      )
      .orderBy(asc(groupMembers.joinedAt));
    const responseMembers = members.map((member) => ({
      ...member,
      role: member.role as "owner" | "member",
    }));
    return c.json(noStore(c, { members: responseMembers }));
  },
);

api.openapi(
  createRoute({
    method: "get",
    path: "/groups/{groupId}/wallets",
    request: { params: z.object({ groupId: uuid }) },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({ wallets: z.array(walletSchema) }),
          },
        },
        description: "Wallets",
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { groupId } = c.req.valid("param");
    const db = c.get("db");
    await requireMember(db, groupId, c.req.raw, c.env);
    const rows = await db
      .select()
      .from(wallets)
      .where(eq(wallets.groupId, groupId))
      .orderBy(asc(wallets.name));
    return c.json(noStore(c, { wallets: rows.map(serializeWallet) }));
  },
);

api.openapi(
  createRoute({
    method: "post",
    path: "/groups/{groupId}/wallets",
    request: {
      params: z.object({ groupId: uuid }),
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().min(1).max(100),
              ownerType: z.enum(["personal", "shared"]),
              ownerMemberId: uuid.optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        content: { "application/json": { schema: walletSchema } },
        description: "Created",
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { groupId } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = c.get("db");
    await requireMember(db, groupId, c.req.raw, c.env);
    if ((body.ownerType === "personal") !== Boolean(body.ownerMemberId))
      throw new ApiError(
        422,
        "INVALID_WALLET_OWNER",
        "個人財布には所有メンバーを、共有財布には所有メンバーなしを指定してください。",
      );
    if (body.ownerMemberId) {
      const [owner] = await db
        .select({ id: groupMembers.id })
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.id, body.ownerMemberId),
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.status, "active"),
          ),
        );
      if (!owner)
        throw new ApiError(
          422,
          "INVALID_WALLET_OWNER",
          "所有メンバーがグループに所属していません。",
        );
    }
    const [wallet] = await db
      .insert(wallets)
      .values({
        groupId,
        name: body.name,
        ownerType: body.ownerType,
        ownerMemberId: body.ownerMemberId ?? null,
      })
      .returning();
    if (!wallet)
      throw new ApiError(409, "CREATE_FAILED", "財布を作成できません。");
    c.header("Location", `/api/groups/${groupId}/wallets/${wallet.id}`);
    return c.json(noStore(c, serializeWallet(wallet)), 201);
  },
);

api.openapi(
  createRoute({
    method: "patch",
    path: "/groups/{groupId}/wallets/{walletId}",
    request: {
      params: z.object({ groupId: uuid, walletId: uuid }),
      body: {
        content: {
          "application/json": {
            schema: z.object({ name: z.string().min(1).max(100) }),
          },
        },
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: walletSchema } },
        description: "Updated",
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { groupId, walletId } = c.req.valid("param");
    const { name } = c.req.valid("json");
    const db = c.get("db");
    await requireMember(db, groupId, c.req.raw, c.env);
    const [wallet] = await db
      .update(wallets)
      .set({ name, updatedAt: new Date() })
      .where(and(eq(wallets.id, walletId), eq(wallets.groupId, groupId)))
      .returning();
    if (!wallet)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "財布が見つかりません。");
    return c.json(noStore(c, serializeWallet(wallet)));
  },
);

api.openapi(
  createRoute({
    method: "delete",
    path: "/groups/{groupId}/wallets/{walletId}",
    request: { params: z.object({ groupId: uuid, walletId: uuid }) },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const { groupId, walletId } = c.req.valid("param");
    const db = c.get("db");
    await requireMember(db, groupId, c.req.raw, c.env);
    const [wallet] = await db
      .select({ id: wallets.id })
      .from(wallets)
      .where(and(eq(wallets.id, walletId), eq(wallets.groupId, groupId)));
    if (!wallet)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "財布が見つかりません。");
    const [withdrawal] = await db
      .select({ id: withdrawals.id })
      .from(withdrawals)
      .where(eq(withdrawals.walletId, walletId))
      .limit(1);
    const [claim] = await db
      .select({ id: claims.id })
      .from(claims)
      .where(eq(claims.walletId, walletId))
      .limit(1);
    if (withdrawal || claim)
      throw new ApiError(
        409,
        "WALLET_IN_USE",
        "参照されている財布は削除できません。",
      );
    await db.delete(wallets).where(eq(wallets.id, walletId));
    c.header("Cache-Control", "no-store");
    return c.body(null, 204);
  },
);

const withdrawalInput = z.object({
  walletId: uuid,
  purpose: z.string().min(1).max(200),
  amount,
  withdrawnOn: date,
  note: z.string().max(1000).nullable().optional(),
});
const withdrawalParams = z.object({ groupId: uuid, withdrawalId: uuid });

api.openapi(
  createRoute({
    method: "get",
    path: "/groups/{groupId}/withdrawals",
    request: {
      params: z.object({ groupId: uuid }),
      query: z.object({
        status: z
          .enum(["unallocated", "allocated", "claimed", "settled"])
          .optional(),
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({ withdrawals: z.array(withdrawalSchema) }),
          },
        },
        description: "Withdrawals",
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { groupId } = c.req.valid("param");
    const { status, limit } = c.req.valid("query");
    const db = c.get("db");
    await requireMember(db, groupId, c.req.raw, c.env);
    const rows = await db
      .select()
      .from(withdrawals)
      .where(
        status
          ? and(
              eq(withdrawals.groupId, groupId),
              eq(withdrawals.status, status),
            )
          : eq(withdrawals.groupId, groupId),
      )
      .orderBy(desc(withdrawals.withdrawnOn), desc(withdrawals.createdAt))
      .limit(limit);
    return c.json(
      noStore(c, {
        withdrawals: await Promise.all(
          rows.map((row) => withdrawalById(db, groupId, row.id)),
        ),
      }),
    );
  },
);

api.openapi(
  createRoute({
    method: "post",
    path: "/groups/{groupId}/withdrawals",
    request: {
      params: z.object({ groupId: uuid }),
      body: { content: { "application/json": { schema: withdrawalInput } } },
    },
    responses: {
      201: {
        content: { "application/json": { schema: withdrawalSchema } },
        description: "Created",
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { groupId } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = c.get("db");
    const actor = await requireMember(db, groupId, c.req.raw, c.env);
    const [wallet] = await db
      .select({ id: wallets.id })
      .from(wallets)
      .where(and(eq(wallets.id, body.walletId), eq(wallets.groupId, groupId)));
    if (!wallet)
      throw new ApiError(
        422,
        "INVALID_WALLET",
        "出金元財布がグループに属していません。",
      );
    const id = crypto.randomUUID();
    const activityId = crypto.randomUUID();
    await db.batch([
      db.insert(withdrawals).values({
        id,
        groupId,
        walletId: body.walletId,
        purpose: body.purpose,
        amount: BigInt(body.amount),
        withdrawnOn: body.withdrawnOn,
        note: body.note ?? null,
        status: "unallocated",
      }),
      db.insert(activities).values({
        id: activityId,
        groupId,
        actorMemberId: actor.id,
        type: "withdrawal_created",
        subjectId: id,
        metadata: {},
      }),
    ]);
    c.header("Location", `/api/groups/${groupId}/withdrawals/${id}`);
    return c.json(noStore(c, await withdrawalById(db, groupId, id)), 201);
  },
);

api.openapi(
  createRoute({
    method: "get",
    path: "/groups/{groupId}/withdrawals/{withdrawalId}",
    request: { params: withdrawalParams },
    responses: {
      200: {
        content: { "application/json": { schema: withdrawalSchema } },
        description: "Withdrawal",
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { groupId, withdrawalId } = c.req.valid("param");
    const db = c.get("db");
    await requireMember(db, groupId, c.req.raw, c.env);
    return c.json(noStore(c, await withdrawalById(db, groupId, withdrawalId)));
  },
);

api.openapi(
  createRoute({
    method: "patch",
    path: "/groups/{groupId}/withdrawals/{withdrawalId}",
    request: {
      params: withdrawalParams,
      body: {
        content: { "application/json": { schema: withdrawalInput.partial() } },
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: withdrawalSchema } },
        description: "Updated",
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { groupId, withdrawalId } = c.req.valid("param");
    const body = c.req.valid("json");
    const db = c.get("db");
    await requireMember(db, groupId, c.req.raw, c.env);
    const existing = await withdrawalById(db, groupId, withdrawalId);
    if (existing.status !== "unallocated")
      throw new ApiError(
        409,
        "WITHDRAWAL_LOCKED",
        "配分後の出金は編集できません。",
      );
    if (body.walletId) {
      const [wallet] = await db
        .select({ id: wallets.id })
        .from(wallets)
        .where(
          and(eq(wallets.id, body.walletId), eq(wallets.groupId, groupId)),
        );
      if (!wallet)
        throw new ApiError(
          422,
          "INVALID_WALLET",
          "出金元財布がグループに属していません。",
        );
    }
    await db
      .update(withdrawals)
      .set({
        ...body,
        amount: body.amount ? BigInt(body.amount) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(withdrawals.id, withdrawalId));
    return c.json(noStore(c, await withdrawalById(db, groupId, withdrawalId)));
  },
);

api.openapi(
  createRoute({
    method: "delete",
    path: "/groups/{groupId}/withdrawals/{withdrawalId}",
    request: { params: withdrawalParams },
    responses: { 204: { description: "Deleted" }, ...errorResponses },
  }),
  async (c) => {
    const { groupId, withdrawalId } = c.req.valid("param");
    const db = c.get("db");
    await requireMember(db, groupId, c.req.raw, c.env);
    const existing = await withdrawalById(db, groupId, withdrawalId);
    if (existing.status !== "unallocated")
      throw new ApiError(
        409,
        "WITHDRAWAL_LOCKED",
        "配分後の出金は削除できません。",
      );
    await db.delete(withdrawals).where(eq(withdrawals.id, withdrawalId));
    c.header("Cache-Control", "no-store");
    return c.body(null, 204);
  },
);

api.openapi(
  createRoute({
    method: "put",
    path: "/groups/{groupId}/withdrawals/{withdrawalId}/allocations",
    request: {
      params: withdrawalParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({ allocations: z.array(allocationSchema).min(1) }),
          },
        },
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: withdrawalSchema } },
        description: "Allocations replaced",
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { groupId, withdrawalId } = c.req.valid("param");
    const { allocations: input } = c.req.valid("json");
    const db = c.get("db");
    const actor = await requireMember(db, groupId, c.req.raw, c.env);
    const withdrawal = await withdrawalById(db, groupId, withdrawalId);
    if (
      withdrawal.status !== "unallocated" &&
      withdrawal.status !== "allocated"
    )
      throw new ApiError(
        409,
        "WITHDRAWAL_LOCKED",
        "請求済みの出金は配分を変更できません。",
      );
    if (new Set(input.map((item) => item.memberId)).size !== input.length)
      throw new ApiError(
        422,
        "DUPLICATE_MEMBER",
        "同じメンバーを複数回指定できません。",
      );
    if (
      input.reduce((total, item) => total + BigInt(item.amount), 0n) !==
      BigInt(withdrawal.amount)
    )
      throw new ApiError(
        422,
        "ALLOCATION_TOTAL_MISMATCH",
        "負担額の合計は出金額と一致する必要があります。",
      );
    const memberRows = await db
      .select({ id: groupMembers.id })
      .from(groupMembers)
      .where(
        and(
          eq(groupMembers.groupId, groupId),
          eq(groupMembers.status, "active"),
        ),
      );
    if (
      memberRows.length !== input.length ||
      !input.every((item) =>
        memberRows.some((member) => member.id === item.memberId),
      )
    )
      throw new ApiError(
        422,
        "INVALID_MEMBER",
        "負担者がグループに所属していません。",
      );
    const now = new Date();
    await db.batch([
      db.delete(allocations).where(eq(allocations.withdrawalId, withdrawalId)),
      db.insert(allocations).values(
        input.map((item) => ({
          id: crypto.randomUUID(),
          withdrawalId,
          memberId: item.memberId,
          amount: BigInt(item.amount),
          createdAt: now,
          updatedAt: now,
        })),
      ),
      db
        .update(withdrawals)
        .set({ status: "allocated", updatedAt: now })
        .where(eq(withdrawals.id, withdrawalId)),
      db.insert(activities).values({
        id: crypto.randomUUID(),
        groupId,
        actorMemberId: actor.id,
        type: "allocation_set",
        subjectId: withdrawalId,
        metadata: {},
      }),
    ]);
    return c.json(noStore(c, await withdrawalById(db, groupId, withdrawalId)));
  },
);

api.openapi(
  createRoute({
    method: "get",
    path: "/groups/{groupId}/claims",
    request: {
      params: z.object({ groupId: uuid }),
      query: z.object({ status: z.enum(["unsettled", "settled"]).optional() }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({ claims: z.array(claimSchema) }),
          },
        },
        description: "Claims",
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { groupId } = c.req.valid("param");
    const { status } = c.req.valid("query");
    const db = c.get("db");
    await requireMember(db, groupId, c.req.raw, c.env);
    const rows = await db
      .select()
      .from(claims)
      .where(
        status
          ? and(eq(claims.groupId, groupId), eq(claims.status, status))
          : eq(claims.groupId, groupId),
      )
      .orderBy(desc(claims.createdAt));
    return c.json(noStore(c, { claims: rows.map(serializeClaim) }));
  },
);

api.openapi(
  createRoute({
    method: "get",
    path: "/groups/{groupId}/claims/{claimId}",
    request: { params: z.object({ groupId: uuid, claimId: uuid }) },
    responses: {
      200: {
        content: { "application/json": { schema: claimSchema } },
        description: "Claim",
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { groupId, claimId } = c.req.valid("param");
    const db = c.get("db");
    await requireMember(db, groupId, c.req.raw, c.env);
    const [claim] = await db
      .select()
      .from(claims)
      .where(and(eq(claims.id, claimId), eq(claims.groupId, groupId)));
    if (!claim)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "請求が見つかりません。");
    return c.json(noStore(c, serializeClaim(claim)));
  },
);

api.openapi(
  createRoute({
    method: "post",
    path: "/groups/{groupId}/withdrawals/{withdrawalId}/claims",
    request: { params: withdrawalParams },
    responses: {
      201: {
        content: {
          "application/json": {
            schema: z.object({ claims: z.array(claimSchema) }),
          },
        },
        description: "Claims created",
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { groupId, withdrawalId } = c.req.valid("param");
    const db = c.get("db");
    const actor = await requireMember(db, groupId, c.req.raw, c.env);
    const withdrawal = await withdrawalById(db, groupId, withdrawalId);
    if (withdrawal.status !== "allocated")
      throw new ApiError(
        409,
        "WITHDRAWAL_NOT_ALLOCATED",
        "配分済みの出金のみ請求できます。",
      );
    const [wallet] = await db
      .select()
      .from(wallets)
      .where(
        and(eq(wallets.id, withdrawal.walletId), eq(wallets.groupId, groupId)),
      );
    if (!wallet)
      throw new ApiError(
        404,
        "RESOURCE_NOT_FOUND",
        "出金元財布が見つかりません。",
      );
    const items = withdrawal.allocations.filter(
      (item) =>
        wallet.ownerType === "shared" || item.memberId !== wallet.ownerMemberId,
    );
    if (items.length === 0)
      throw new ApiError(
        409,
        "NO_CLAIMABLE_ALLOCATION",
        "請求対象となる負担がありません。",
      );
    const allocationRows = await db
      .select()
      .from(allocations)
      .where(eq(allocations.withdrawalId, withdrawalId));
    const targetAllocationIds = allocationRows
      .filter((row) => items.some((item) => item.memberId === row.memberId))
      .map((row) => row.id);
    const claimed = await db
      .select({ allocationId: claimItems.allocationId })
      .from(claimItems)
      .where(inArray(claimItems.allocationId, targetAllocationIds));
    if (claimed.length > 0)
      throw new ApiError(
        409,
        "ALLOCATION_ALREADY_CLAIMED",
        "すでに請求済みの負担があります。",
      );
    const now = new Date();
    const created = items.map((item) => ({
      id: crypto.randomUUID(),
      groupId,
      debtorMemberId: item.memberId,
      walletId: wallet.id,
      amount: BigInt(item.amount),
      status: "unsettled" as const,
      settledAt: null,
      createdAt: now,
      updatedAt: now,
    }));
    const claimItemRows = created.map((claim) => ({
      id: crypto.randomUUID(),
      claimId: claim.id,
      allocationId: allocationRows.find(
        (row) => row.memberId === claim.debtorMemberId,
      )!.id,
      amount: claim.amount,
      createdAt: now,
      updatedAt: now,
    }));
    await db.batch([
      db.insert(claims).values(created),
      db.insert(claimItems).values(claimItemRows),
      db
        .update(withdrawals)
        .set({ status: "claimed", updatedAt: now })
        .where(eq(withdrawals.id, withdrawalId)),
      db.insert(activities).values({
        id: crypto.randomUUID(),
        groupId,
        actorMemberId: actor.id,
        type: "claim_created",
        subjectId: withdrawalId,
        metadata: {},
      }),
    ]);
    c.header("Location", `/api/groups/${groupId}/claims/${created[0]!.id}`);
    return c.json(noStore(c, { claims: created.map(serializeClaim) }), 201);
  },
);

api.openapi(
  createRoute({
    method: "patch",
    path: "/groups/{groupId}/claims/{claimId}",
    request: {
      params: z.object({ groupId: uuid, claimId: uuid }),
      body: {
        content: {
          "application/json": {
            schema: z.object({ status: z.literal("settled") }),
          },
        },
      },
    },
    responses: {
      200: {
        content: { "application/json": { schema: claimSchema } },
        description: "Settled",
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { groupId, claimId } = c.req.valid("param");
    const db = c.get("db");
    const actor = await requireMember(db, groupId, c.req.raw, c.env);
    const [claim] = await db
      .select()
      .from(claims)
      .where(and(eq(claims.id, claimId), eq(claims.groupId, groupId)));
    if (!claim)
      throw new ApiError(404, "RESOURCE_NOT_FOUND", "請求が見つかりません。");
    if (claim.status === "settled")
      return c.json(noStore(c, serializeClaim(claim)));
    const [item] = await db
      .select({ withdrawalId: allocations.withdrawalId })
      .from(claimItems)
      .innerJoin(allocations, eq(allocations.id, claimItems.allocationId))
      .where(eq(claimItems.claimId, claimId));
    if (!item)
      throw new ApiError(
        409,
        "CLAIM_ITEM_MISSING",
        "請求の内訳が見つかりません。",
      );
    const unsettled = await db
      .select({ id: claims.id })
      .from(claims)
      .innerJoin(claimItems, eq(claimItems.claimId, claims.id))
      .innerJoin(allocations, eq(allocations.id, claimItems.allocationId))
      .where(
        and(
          eq(allocations.withdrawalId, item.withdrawalId),
          eq(claims.status, "unsettled"),
        ),
      );
    const now = new Date();
    const settleClaim = db
      .update(claims)
      .set({ status: "settled", settledAt: now, updatedAt: now })
      .where(eq(claims.id, claimId));
    const recordActivity = db.insert(activities).values({
      id: crypto.randomUUID(),
      groupId,
      actorMemberId: actor.id,
      type: "claim_settled",
      subjectId: claimId,
      metadata: {},
    });
    if (unsettled.length === 1)
      await db.batch([
        settleClaim,
        recordActivity,
        db
          .update(withdrawals)
          .set({ status: "settled", updatedAt: now })
          .where(eq(withdrawals.id, item.withdrawalId)),
      ]);
    else await db.batch([settleClaim, recordActivity]);
    const [updated] = await db
      .select()
      .from(claims)
      .where(eq(claims.id, claimId));
    if (!updated)
      throw new ApiError(409, "SETTLEMENT_FAILED", "請求を精算できません。");
    return c.json(noStore(c, serializeClaim(updated)));
  },
);

api.openapi(
  createRoute({
    method: "get",
    path: "/groups/{groupId}/dashboard",
    request: { params: z.object({ groupId: uuid }) },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              unsettledClaimCount: z.number().int(),
              unsettledClaimAmount: amount,
              recentActivities: z.array(
                z.object({
                  id: uuid,
                  type: z.string(),
                  subjectId: uuid,
                  createdAt: z.string().datetime(),
                }),
              ),
            }),
          },
        },
        description: "Dashboard",
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { groupId } = c.req.valid("param");
    const db = c.get("db");
    await requireMember(db, groupId, c.req.raw, c.env);
    const openClaims = await db
      .select({ amount: claims.amount })
      .from(claims)
      .where(and(eq(claims.groupId, groupId), eq(claims.status, "unsettled")));
    const recent = await db
      .select({
        id: activities.id,
        type: activities.type,
        subjectId: activities.subjectId,
        createdAt: activities.createdAt,
      })
      .from(activities)
      .where(eq(activities.groupId, groupId))
      .orderBy(desc(activities.createdAt))
      .limit(20);
    return c.json(
      noStore(c, {
        unsettledClaimCount: openClaims.length,
        unsettledClaimAmount: openClaims
          .reduce((total, claim) => total + claim.amount, 0n)
          .toString(),
        recentActivities: recent.map((activity) => ({
          ...activity,
          createdAt: activity.createdAt.toISOString(),
        })),
      }),
    );
  },
);

api.openapi(
  createRoute({
    method: "get",
    path: "/groups/{groupId}/activities",
    request: {
      params: z.object({ groupId: uuid }),
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(50),
      }),
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: z.object({
              activities: z.array(
                z.object({
                  id: uuid,
                  type: z.string(),
                  subjectId: uuid,
                  actorMemberId: uuid,
                  createdAt: z.string().datetime(),
                }),
              ),
            }),
          },
        },
        description: "Activities",
      },
      ...errorResponses,
    },
  }),
  async (c) => {
    const { groupId } = c.req.valid("param");
    const { limit } = c.req.valid("query");
    const db = c.get("db");
    await requireMember(db, groupId, c.req.raw, c.env);
    const rows = await db
      .select({
        id: activities.id,
        type: activities.type,
        subjectId: activities.subjectId,
        actorMemberId: activities.actorMemberId,
        createdAt: activities.createdAt,
      })
      .from(activities)
      .where(eq(activities.groupId, groupId))
      .orderBy(desc(activities.createdAt))
      .limit(limit);
    return c.json(
      noStore(c, {
        activities: rows.map((activity) => ({
          ...activity,
          createdAt: activity.createdAt.toISOString(),
        })),
      }),
    );
  },
);
