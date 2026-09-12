import { Heading, Screen } from "../components/layout";
import { Badge, Card, Icon } from "../components/ui";

const invoices = [
  {
    id: "parking",
    memberName: "愛美",
    description: "駐車場代",
    destinationWallet: "共有財布",
    amount: "¥200",
    status: "未精算",
  },
  {
    id: "groceries",
    memberName: "大地",
    description: "週の食料品",
    destinationWallet: "共有口座",
    amount: "¥4,250",
    status: "未精算",
  },
  {
    id: "daily-necessities",
    memberName: "愛美",
    description: "日用品",
    destinationWallet: "共有口座",
    amount: "¥1,500",
    status: "精算済み",
  },
] as const;

const statuses = ["すべて", "未精算", "精算済み"] as const;

export function InvoicesPage() {
  return (
    <Screen active="invoices">
      <Heading eyebrow="請求・精算状況を確認" title="請求一覧" />
      <div
        className="mt-[-10px] mb-5 flex flex-wrap gap-2"
        role="group"
        aria-label="請求状態"
      >
        {statuses.map((status) => {
          const isSelected = status === "すべて";
          return (
            <span
              key={status}
              className={`border border-black px-4 py-2 text-xs font-bold ${
                isSelected ? "bg-black text-white" : "bg-white text-black"
              }`}
              aria-current={isSelected ? "true" : undefined}
            >
              {status}
            </span>
          );
        })}
      </div>
      <Card>
        {invoices.map((invoice) => (
          <div
            className="flex min-h-[88px] items-center gap-3 border-b border-black px-3.5 py-3 last:border-b-0"
            key={invoice.id}
          >
            <span className="grid size-10 shrink-0 place-items-center bg-neutral-100 text-black">
              <Icon name={invoice.status === "精算済み" ? "check" : "wallet"} />
            </span>
            <div className="min-w-0 flex-1 break-words">
              <b className="block text-sm">{invoice.memberName}さんへの請求</b>
              <small className="mt-0.5 block text-xs text-neutral-600">
                {invoice.description}
              </small>
              <small className="mt-0.5 block text-xs text-neutral-600">
                返済先: {invoice.destinationWallet}
              </small>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <strong>{invoice.amount}</strong>
              <Badge>{invoice.status}</Badge>
            </div>
          </div>
        ))}
      </Card>
    </Screen>
  );
}
