import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ApiRequestError,
  deleteGroupClaim,
  getGroupClaims,
  type ClaimListItem,
  updateGroupClaimStatus,
} from "../api";
import { BottomNav } from "../components/layout";
import { Badge, Card, Icon } from "../components/ui";
import { useGroupContext } from "../use-group-context";

export function InvoiceDetailPage() {
  const { claimId } = useParams();
  const navigate = useNavigate();
  const { currentGroup, errorMessage, isLoading, refresh, unauthenticate } =
    useGroupContext();
  const [claim, setClaim] = useState<ClaimListItem | null>(null);
  const [claimsError, setClaimsError] = useState<string | null>(null);
  const [areClaimsLoading, setAreClaimsLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const refreshClaim = useCallback(async () => {
    if (!currentGroup || !claimId) return;

    setAreClaimsLoading(true);
    setClaimsError(null);
    try {
      const claims = await getGroupClaims(currentGroup.id);
      setClaim(claims.find((item) => item.id === claimId) ?? null);
    } catch (error) {
      setClaim(null);
      if (error instanceof ApiRequestError && error.status === 401) {
        unauthenticate();
        return;
      }
      setClaimsError(
        error instanceof Error ? error.message : "請求の取得に失敗しました。",
      );
    } finally {
      setAreClaimsLoading(false);
    }
  }, [claimId, currentGroup, unauthenticate]);

  useEffect(() => {
    void Promise.resolve().then(refreshClaim);
  }, [refreshClaim]);

  const updateStatus = async (status: "unsettled" | "settled") => {
    if (!currentGroup || !claim) return;

    setIsUpdatingStatus(true);
    setActionError(null);
    try {
      await updateGroupClaimStatus(currentGroup.id, claim.id, status);
      await refreshClaim();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        unauthenticate();
        return;
      }
      setActionError(
        error instanceof Error
          ? error.message
          : "請求状態を更新できませんでした。",
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const deleteClaim = async () => {
    if (!currentGroup || !claim) return;
    if (
      !window.confirm(
        `「${claim.debtorMemberName}さんへの請求」を削除しますか？`,
      )
    )
      return;

    setIsDeleting(true);
    setActionError(null);
    try {
      await deleteGroupClaim(currentGroup.id, claim.id);
      navigate("/invoices", { replace: true });
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        unauthenticate();
        return;
      }
      setActionError(
        error instanceof Error ? error.message : "請求を削除できませんでした。",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const isSettled = claim?.status === "settled";

  return (
    <main className="mx-auto min-h-svh w-full max-w-2xl bg-white px-6 pt-6 pb-28 text-black">
      <Link
        className="mb-8 inline-flex items-center gap-1 text-sm font-bold"
        to="/invoices"
      >
        <Icon name="back" size={18} />
        請求一覧へ戻る
      </Link>
      {isLoading ? (
        <Message>グループ情報を取得中です…</Message>
      ) : !currentGroup ? (
        <Message
          error={errorMessage}
          onRetry={errorMessage ? refresh : undefined}
        >
          {errorMessage ?? "現在、所属しているグループはありません。"}
        </Message>
      ) : areClaimsLoading ? (
        <Message>請求を取得中です…</Message>
      ) : claimsError ? (
        <Message error={claimsError} onRetry={refreshClaim}>
          {claimsError}
        </Message>
      ) : !claim ? (
        <Message error="not-found">
          指定された請求は見つかりませんでした。
        </Message>
      ) : (
        <article>
          <header className="mb-8">
            <p className="mb-1 text-xs font-bold">請求の詳細</p>
            <h1 className="text-[34px] leading-tight font-extrabold tracking-[-0.04em]">
              {claim.debtorMemberName}さんへの請求
            </h1>
          </header>
          <Card className="mb-6 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="mb-1 text-xs text-neutral-600">請求金額</p>
                <strong className="text-3xl tracking-[-0.04em]">
                  ¥{BigInt(claim.amount).toLocaleString("ja-JP")}
                </strong>
              </div>
              <Badge>{isSettled ? "精算済み" : "未精算"}</Badge>
            </div>
            <div className="mt-5 border-t border-black pt-4">
              <p className="mb-1 text-xs text-neutral-600">返済先</p>
              <p className="font-bold">{claim.walletName}</p>
            </div>
          </Card>
          <section aria-labelledby="invoice-items-heading">
            <h2 id="invoice-items-heading" className="mb-3 text-sm font-bold">
              請求の内訳
            </h2>
            <Card>
              {claim.items.length > 0 ? (
                claim.items.map((item) => (
                  <div
                    className="flex items-center justify-between gap-4 border-b border-black px-4 py-3.5 last:border-b-0"
                    key={item.withdrawalId}
                  >
                    <p className="font-bold">{item.purpose}</p>
                    <strong className="shrink-0">
                      ¥{BigInt(item.amount).toLocaleString("ja-JP")}
                    </strong>
                  </div>
                ))
              ) : (
                <p className="p-4 text-sm text-neutral-600">
                  内訳はありません。
                </p>
              )}
            </Card>
          </section>
          <section className="mt-8" aria-labelledby="settlement-heading">
            <h2 id="settlement-heading" className="mb-3 text-sm font-bold">
              精算状況
            </h2>
            <Card className="p-4">
              {isSettled ? (
                <div>
                  <div className="flex items-center gap-3" role="status">
                    <span className="grid size-10 place-items-center rounded-full bg-black text-white">
                      <Icon name="check" />
                    </span>
                    <div>
                      <p className="font-bold">精算が完了しました</p>
                      <p className="text-xs text-neutral-600">
                        この請求は精算済みです。
                      </p>
                    </div>
                  </div>
                  <button
                    className="mt-4 text-sm font-bold underline disabled:text-neutral-400"
                    disabled={isUpdatingStatus || isDeleting}
                    onClick={() => void updateStatus("unsettled")}
                    type="button"
                  >
                    {isUpdatingStatus ? "取消中…" : "精算完了を取り消す"}
                  </button>
                </div>
              ) : (
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    checked={false}
                    className="size-5 accent-black"
                    disabled={isUpdatingStatus || isDeleting}
                    onChange={(event) => {
                      if (event.target.checked) void updateStatus("settled");
                    }}
                    type="checkbox"
                  />
                  <span>
                    <span className="block font-bold">精算を完了する</span>
                    <span className="block text-xs text-neutral-600">
                      チェックすると、この請求を精算済みにします。
                    </span>
                  </span>
                </label>
              )}
            </Card>
            {actionError && (
              <p className="mt-3 text-sm text-red-600" role="alert">
                {actionError}
              </p>
            )}
          </section>
          <button
            className="mt-8 w-full border border-red-600 py-3 text-sm font-bold text-red-600 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:text-neutral-400"
            disabled={isUpdatingStatus || isDeleting}
            onClick={() => void deleteClaim()}
            type="button"
          >
            {isDeleting ? "削除中…" : "請求を削除する"}
          </button>
        </article>
      )}
      <BottomNav active="invoices" />
    </main>
  );
}

function Message({
  children,
  error,
  onRetry,
}: {
  children: string;
  error?: string | null;
  onRetry?: () => void | Promise<void>;
}) {
  return (
    <Card className="p-4">
      <p
        className="text-sm text-neutral-600"
        role={error ? "alert" : undefined}
        aria-busy={!error && children.endsWith("…") ? "true" : undefined}
      >
        {children}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={() => void onRetry()}
          className="mt-3 text-sm font-bold underline"
        >
          再試行
        </button>
      )}
    </Card>
  );
}
