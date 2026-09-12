const apiOrigin = (
  import.meta.env.VITE_API_ORIGIN ?? "http://localhost:8787"
).replace(/\/$/, "");

export type Group = {
  id: string;
  name: string;
  memberId: string;
};

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  groups: Group[];
};

export type GroupMember = {
  id: string;
  name: string;
  role: "owner" | "member";
  avatarUrl: string | null;
};

export type Wallet = {
  id: string;
  groupId: string;
  ownerMemberId: string | null;
  name: string;
  ownerType: "personal" | "shared";
  createdAt: string;
  updatedAt: string;
};

export type CreateWalletInput = {
  name: string;
  ownerType: Wallet["ownerType"];
  ownerMemberId?: string;
};

export type Withdrawal = {
  id: string;
  groupId: string;
  walletId: string;
  purpose: string;
  amount: string;
  withdrawnOn: string;
  note: string | null;
  status: "unallocated" | "allocated" | "claimed" | "settled";
  createdAt: string;
  updatedAt: string;
  allocations: { memberId: string; amount: string }[];
};

export type CreateWithdrawalInput = {
  walletId: string;
  purpose: string;
  amount: string;
  withdrawnOn: string;
  note?: string | null;
};

type ErrorResponse = {
  message?: string;
};

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, {
    credentials: "include",
  });

  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as ErrorResponse | null;
    throw new ApiRequestError(
      response.status,
      body?.message ?? "データの取得に失敗しました。",
    );
  }

  return response.json() as Promise<T>;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${apiOrigin}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseBody = (await response
      .json()
      .catch(() => null)) as ErrorResponse | null;
    throw new ApiRequestError(
      response.status,
      responseBody?.message ?? "データの作成に失敗しました。",
    );
  }

  return response.json() as Promise<T>;
}

async function del(path: string): Promise<void> {
  const response = await fetch(`${apiOrigin}${path}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as ErrorResponse | null;
    throw new ApiRequestError(
      response.status,
      body?.message ?? "データの削除に失敗しました。",
    );
  }
}

export function getCurrentUser() {
  return get<CurrentUser>("/api/me");
}

export async function getGroupMembers(groupId: string) {
  const response = await get<{ members: GroupMember[] }>(
    `/api/groups/${groupId}/members`,
  );
  return response.members;
}

export async function getGroupWallets(groupId: string) {
  const response = await get<{ wallets: Wallet[] }>(
    `/api/groups/${groupId}/wallets`,
  );
  return response.wallets;
}

export function createGroupWallet(groupId: string, input: CreateWalletInput) {
  return post<Wallet>(`/api/groups/${groupId}/wallets`, input);
}

export function deleteGroupWallet(groupId: string, walletId: string) {
  return del(`/api/groups/${groupId}/wallets/${walletId}`);
}

export async function getGroupWithdrawals(groupId: string) {
  const response = await get<{ withdrawals: Withdrawal[] }>(
    `/api/groups/${groupId}/withdrawals`,
  );
  return response.withdrawals;
}

export function createGroupWithdrawal(
  groupId: string,
  input: CreateWithdrawalInput,
) {
  return post<Withdrawal>(`/api/groups/${groupId}/withdrawals`, input);
}

export function deleteGroupWithdrawal(groupId: string, withdrawalId: string) {
  return del(`/api/groups/${groupId}/withdrawals/${withdrawalId}`);
}
