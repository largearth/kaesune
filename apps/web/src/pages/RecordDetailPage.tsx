import { useCallback, useEffect, useState } from "react";
import Delete01Icon from "@hugeicons/core-free-icons/Delete01Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ApiRequestError,
  deleteGroupWithdrawal,
  getGroupWithdrawals,
  type Withdrawal,
} from "../api";
import { BottomNav } from "../components/layout";
import { Card } from "../components/ui";
import { useWalletStore } from "../stores/use-wallet-store";
import { useGroupContext } from "../use-group-context";

export function RecordDetailPage() {
  const { withdrawalId } = useParams();
  const navigate = useNavigate();
  const { currentGroup, errorMessage, isLoading, refresh, unauthenticate } =
    useGroupContext();
  const [withdrawal, setWithdrawal] = useState<Withdrawal | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const wallets = useWalletStore((state) => state.wallets);

  const refreshRecord = useCallback(async () => {
    if (!currentGroup || !withdrawalId) return;

    setIsDataLoading(true);
    setDataError(null);
    try {
      const withdrawals = await getGroupWithdrawals(currentGroup.id);
      setWithdrawal(
        withdrawals.find((item) => item.id === withdrawalId) ?? null,
      );
    } catch (error) {
      setWithdrawal(null);
      if (error instanceof ApiRequestError && error.status === 401) {
        unauthenticate();
        return;
      }
      setDataError(
        error instanceof Error
          ? error.message
          : "出金記録の取得に失敗しました。",
      );
    } finally {
      setIsDataLoading(false);
    }
  }, [currentGroup, unauthenticate, withdrawalId]);

  useEffect(() => {
    void Promise.resolve().then(refreshRecord);
  }, [refreshRecord]);

  const deleteWithdrawal = async () => {
    if (!currentGroup || !withdrawal) return;
    if (!window.confirm(`「${withdrawal.purpose}」を削除しますか？`)) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      await deleteGroupWithdrawal(currentGroup.id, withdrawal.id);
      navigate("/records", { replace: true });
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        unauthenticate();
        return;
      }
      setDeleteError(
        error instanceof Error
          ? error.message
          : "出金記録を削除できませんでした。",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const walletName = withdrawal
    ? (wallets.find((wallet) => wallet.id === withdrawal.walletId)?.name ??
      "不明な財布")
    : "";

  return (
    <main className="mx-auto min-h-svh w-full max-w-2xl bg-white px-6 pt-6 pb-28 text-black">
      <div className="mb-8 flex items-center justify-between">
        <Link className="text-sm font-bold" to="/records">
          ← 戻る
        </Link>
        <div className="relative">
          <button
            aria-expanded={isMenuOpen}
            aria-label={
              isMenuOpen ? "操作メニューを閉じる" : "操作メニューを開く"
            }
            className="flex size-8 items-center justify-center text-2xl leading-none"
            onClick={() => setIsMenuOpen((current) => !current)}
            type="button"
          >
            <span aria-hidden="true">⋮</span>
          </button>
          {isMenuOpen && withdrawal?.status === "unallocated" && (
            <div className="absolute top-8 right-0 z-10 min-w-32 border border-black bg-white p-1 shadow-[3px_3px_0_0_#000]">
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  void deleteWithdrawal();
                }}
                disabled={isDeleting}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-bold text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-neutral-400"
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={Delete01Icon}
                  size={18}
                  strokeWidth={1.8}
                />
                {isDeleting ? "削除中…" : "削除する"}
              </button>
            </div>
          )}
        </div>
      </div>
      {isLoading ? (
        <Card className="p-4">
          <p className="text-sm" aria-busy="true">
            グループ情報を取得中です…
          </p>
        </Card>
      ) : !currentGroup ? (
        <Card className="p-4">
          <p className="text-sm" role="alert">
            {errorMessage ?? "現在、所属しているグループはありません。"}
          </p>
          {errorMessage && (
            <button
              type="button"
              onClick={() => void refresh()}
              className="mt-3 text-sm font-bold underline"
            >
              再試行
            </button>
          )}
        </Card>
      ) : isDataLoading ? (
        <Card className="p-4">
          <p className="text-sm" aria-busy="true">
            出金記録を取得中です…
          </p>
        </Card>
      ) : dataError ? (
        <Card className="p-4">
          <p className="text-sm" role="alert">
            {dataError}
          </p>
          <button
            type="button"
            onClick={() => void refreshRecord()}
            className="mt-3 text-sm font-bold underline"
          >
            再試行
          </button>
        </Card>
      ) : !withdrawal ? (
        <Card className="p-4">
          <p className="text-sm" role="alert">
            指定された出金記録は見つかりませんでした。
          </p>
        </Card>
      ) : (
        <article>
          <div className="mb-6">
            <h1 className="text-[34px] leading-tight font-extrabold tracking-[-0.04em]">
              ¥{BigInt(withdrawal.amount).toLocaleString("ja-JP")}
            </h1>
          </div>
          {deleteError && (
            <p className="mb-4 text-sm text-red-600" role="alert">
              {deleteError}
            </p>
          )}
          <dl>
            <DetailRow label="出金元" value={walletName} />
            <DetailRow label="用途" value={withdrawal.purpose} />
            <DetailRow
              label="取引日"
              value={withdrawal.withdrawnOn.replaceAll("-", "/")}
            />
            <DetailRow label="メモ" value={withdrawal.note || "—"} />
          </dl>
          <button
            className="mt-8 h-12 w-full bg-black text-base font-bold text-white"
            disabled
            title="請求発行機能は準備中です"
            type="button"
          >
            請求を発行する
          </button>
        </article>
      )}
      <BottomNav active="records" />
    </main>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-black py-3.5">
      <dt className="mb-2 text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="text-base font-bold">{value}</dd>
    </div>
  );
}
