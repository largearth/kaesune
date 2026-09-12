import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ApiRequestError,
  createGroupWithdrawalClaims,
  getGroupMembers,
  getGroupWithdrawals,
  replaceGroupWithdrawalAllocations,
  type GroupMember,
  type Withdrawal,
} from "../api";
import { Screen } from "../components/layout";
import { Avatar, Badge, Card, Icon } from "../components/ui";
import { useWalletStore } from "../stores/use-wallet-store";
import { useGroupContext } from "../use-group-context";

type AllocationView = {
  member: GroupMember;
  amount: bigint;
};

export function AllocationPage() {
  const { withdrawalId } = useParams();
  const navigate = useNavigate();
  const { currentGroup, errorMessage, isLoading, refresh, unauthenticate } =
    useGroupContext();
  const [withdrawal, setWithdrawal] = useState<Withdrawal | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [claimCreateError, setClaimCreateError] = useState<string | null>(null);
  const [isCreatingClaims, setIsCreatingClaims] = useState(false);
  const wallets = useWalletStore((state) => state.wallets);
  const walletStatus = useWalletStore((state) => state.walletStatus);
  const walletErrorMessage = useWalletStore(
    (state) => state.walletErrorMessage,
  );
  const retryWalletLoad = useWalletStore((state) => state.retryWalletLoad);

  const refreshPageData = useCallback(async () => {
    if (!currentGroup || !withdrawalId) return;

    setIsDataLoading(true);
    setDataError(null);
    try {
      const [nextWithdrawals, nextMembers] = await Promise.all([
        getGroupWithdrawals(currentGroup.id),
        getGroupMembers(currentGroup.id),
      ]);
      setWithdrawal(
        nextWithdrawals.find((item) => item.id === withdrawalId) ?? null,
      );
      setMembers(nextMembers);
    } catch (error) {
      setWithdrawal(null);
      setMembers([]);
      if (error instanceof ApiRequestError && error.status === 401) {
        unauthenticate();
        return;
      }
      setDataError(
        error instanceof Error
          ? error.message
          : "請求発行に必要な情報を取得できませんでした。",
      );
    } finally {
      setIsDataLoading(false);
    }
  }, [currentGroup, unauthenticate, withdrawalId]);

  useEffect(() => {
    void Promise.resolve().then(refreshPageData);
  }, [refreshPageData]);

  const wallet = withdrawal
    ? (wallets.find((item) => item.id === withdrawal.walletId) ?? null)
    : null;
  const allocations = useMemo(
    () => (withdrawal ? buildAllocations(withdrawal, members) : []),
    [members, withdrawal],
  );
  const withdrawalAmount = withdrawal ? BigInt(withdrawal.amount) : 0n;
  const allocationTotal = allocations.reduce(
    (total, allocation) => total + allocation.amount,
    0n,
  );
  const remainingAmount = withdrawalAmount - allocationTotal;
  const claimTargets = allocations.filter(
    ({ member, amount }) =>
      amount > 0n &&
      (wallet?.ownerType === "shared" || member.id !== wallet?.ownerMemberId),
  );
  const isWalletLoading =
    Boolean(currentGroup) &&
    (walletStatus === "idle" || walletStatus === "loading");
  const loadError = dataError ?? walletErrorMessage;

  const createClaims = async () => {
    if (!currentGroup || !withdrawalId || isCreatingClaims) return;

    setIsCreatingClaims(true);
    setClaimCreateError(null);
    try {
      await replaceGroupWithdrawalAllocations(
        currentGroup.id,
        withdrawalId,
        allocations.map(({ member, amount }) => ({
          memberId: member.id,
          amount: amount.toString(),
        })),
      );
      await createGroupWithdrawalClaims(currentGroup.id, withdrawalId);
      navigate("/invoices");
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        unauthenticate();
        return;
      }
      setClaimCreateError(
        error instanceof Error ? error.message : "請求を作成できませんでした。",
      );
    } finally {
      setIsCreatingClaims(false);
    }
  };

  return (
    <Screen className="pb-0">
      <header className="mb-8">
        <Link
          className="mb-8 inline-flex items-center gap-2 text-sm font-bold text-black"
          to={withdrawalId ? `/records/${withdrawalId}` : "/records"}
        >
          <Icon name="back" size={20} />
          出金詳細に戻る
        </Link>
        <h1 className="m-0 text-[34px] leading-tight font-extrabold tracking-[-0.06em] text-black">
          負担を割り当てる
        </h1>
      </header>

      {isLoading ? (
        <StatusCard message="グループ情報を取得中です…" loading />
      ) : !currentGroup ? (
        <StatusCard
          message={errorMessage ?? "現在、所属しているグループはありません。"}
          onRetry={errorMessage ? () => void refresh() : undefined}
        />
      ) : isDataLoading || isWalletLoading ? (
        <StatusCard message="請求発行に必要な情報を取得中です…" loading />
      ) : loadError ? (
        <StatusCard
          message={loadError}
          onRetry={() => {
            if (walletStatus === "error") retryWalletLoad();
            void refreshPageData();
          }}
        />
      ) : !withdrawal ? (
        <StatusCard message="指定された出金記録は見つかりませんでした。" />
      ) : !wallet ? (
        <StatusCard message="出金元の財布が見つかりませんでした。" />
      ) : members.length === 0 ? (
        <StatusCard message="負担を割り当てられるメンバーがいません。" />
      ) : (
        <article>
          <Card className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center p-5">
            <div>
              <p className="mb-2 text-xs font-medium text-neutral-500">
                出金額
              </p>
              <strong className="text-2xl tracking-[-0.03em]">
                {formatYen(withdrawalAmount)}
              </strong>
            </div>
            <span className="mx-5 h-16 w-px bg-black" aria-hidden="true" />
            <div>
              <p className="mb-2 text-xs font-medium text-neutral-500">
                支払い元
              </p>
              <Badge>{wallet.name}</Badge>
            </div>
          </Card>

          <Card className="mb-4 p-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="mb-1 text-xs font-bold">負担額の合計</p>
                <strong className="text-xl">
                  {formatYen(allocationTotal)}
                </strong>
              </div>
              <p className="text-sm font-bold">
                残り&nbsp; {formatYen(remainingAmount)}
              </p>
            </div>
          </Card>

          <div
            aria-label="負担配分プリセット（画面確認用）"
            className="mb-4 flex gap-2 overflow-x-auto pb-1"
          >
            <button
              aria-pressed="true"
              className="h-11 shrink-0 border border-accent bg-white px-4 text-xs font-bold text-accent"
              disabled
              type="button"
            >
              ＝ 均等にする
            </button>
            {members.map((member) => (
              <button
                className="h-11 shrink-0 border border-black bg-white px-4 text-xs font-bold text-black"
                disabled
                key={member.id}
                type="button"
              >
                {member.name}が全額
              </button>
            ))}
          </div>

          <Card>
            {allocations.map(({ member, amount }, index) => (
              <div
                className={`flex min-h-20 items-center gap-3 p-4 ${index < allocations.length - 1 ? "border-b border-black" : ""}`}
                key={member.id}
              >
                <Avatar name={member.name} />
                <div className="min-w-0 flex-1">
                  <b className="block truncate text-sm">{member.name}</b>
                  {member.id === currentGroup.memberId && (
                    <small className="block text-xs text-neutral-600">
                      あなた
                    </small>
                  )}
                </div>
                <div className="flex min-w-32 items-center justify-between border border-black px-4 py-3 text-sm">
                  <span>¥</span>
                  <b>{amount.toLocaleString("ja-JP")}</b>
                </div>
              </div>
            ))}
          </Card>

          <Card className="mt-5 p-4">
            <h2 className="mb-4 text-sm font-bold">発行される請求</h2>
            {claimTargets.length > 0 ? (
              <div className="space-y-4">
                {claimTargets.map(({ member, amount }) => (
                  <div className="flex items-center gap-3" key={member.id}>
                    <Avatar name={member.name} />
                    <div className="min-w-0 flex-1">
                      <b className="block text-sm">
                        {member.name}に {formatYen(amount)} を請求
                      </b>
                      <small className="block truncate text-xs text-neutral-600">
                        {wallet.name}への返済
                      </small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-600">
                この配分から発行される請求はありません。
              </p>
            )}
          </Card>

          {claimCreateError && (
            <p className="mt-5 text-sm text-red-600" role="alert">
              {claimCreateError}
            </p>
          )}
          <button
            aria-describedby="claim-issue-note"
            className="mt-5 h-14 w-full bg-black text-base font-bold text-white"
            disabled={isCreatingClaims || claimTargets.length === 0}
            onClick={() => void createClaims()}
            type="button"
          >
            {isCreatingClaims ? "請求を発行中…" : "請求を発行する"}
          </button>
          <p
            className="mt-4 flex items-start gap-2 text-xs leading-6 text-neutral-600"
            id="claim-issue-note"
          >
            <span
              aria-hidden="true"
              className="mt-1 grid size-4 shrink-0 place-items-center rounded-full border border-accent text-[10px] font-bold text-accent"
            >
              i
            </span>
            <span>
              発行すると、表示中の負担配分を保存して対象メンバーへの請求として記録します。
            </span>
          </p>
        </article>
      )}
    </Screen>
  );
}

function buildAllocations(
  withdrawal: Withdrawal,
  members: GroupMember[],
): AllocationView[] {
  if (withdrawal.status !== "unallocated") {
    const amountByMemberId = new Map(
      withdrawal.allocations.map((allocation) => [
        allocation.memberId,
        BigInt(allocation.amount),
      ]),
    );
    return members.map((member) => ({
      member,
      amount: amountByMemberId.get(member.id) ?? 0n,
    }));
  }

  if (members.length === 0) return [];

  const total = BigInt(withdrawal.amount);
  const memberCount = BigInt(members.length);
  const baseAmount = total / memberCount;
  const remainder = total % memberCount;

  return members.map((member, index) => ({
    member,
    amount: baseAmount + (BigInt(index) < remainder ? 1n : 0n),
  }));
}

function formatYen(amount: bigint) {
  return `¥${amount.toLocaleString("ja-JP")}`;
}

function StatusCard({
  loading = false,
  message,
  onRetry,
}: {
  loading?: boolean;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <Card className="p-4">
      <p aria-busy={loading || undefined} className="text-sm" role="status">
        {message}
      </p>
      {onRetry && (
        <button
          className="mt-3 text-sm font-bold underline"
          onClick={onRetry}
          type="button"
        >
          再試行
        </button>
      )}
    </Card>
  );
}
