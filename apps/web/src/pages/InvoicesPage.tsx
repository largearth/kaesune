import { Heading, Screen } from "../components/layout";
import { Badge, Card, Icon } from "../components/ui";

const invoices = [
  ["愛美さんの返済", "駐車場代 → 共有財布", "¥200", "未精算", "yellow"],
  ["大地さんの返済", "週の食料品 → 共有口座", "¥4,250", "未精算", "yellow"],
  ["愛美さんの返済", "日用品 → 共有口座", "¥1,500", "精算済み", "green"],
] as const;
export function InvoicesPage() {
  return (
    <Screen active="invoices">
      <Heading eyebrow="返済の確認" title="請求一覧" />
      <div className="mt-[-10px] mb-5 flex gap-2">
        <button className="border border-black bg-black px-4 py-2 text-xs font-bold text-white">
          すべて
        </button>
        <button className="border border-black bg-white px-4 py-2 text-xs font-bold">
          未精算
        </button>
        <button className="border border-black bg-white px-4 py-2 text-xs font-bold">
          精算済み
        </button>
      </div>
      <Card>
        {invoices.map(([name, detail, amount, status, tone]) => (
          <div
            className="flex min-h-[76px] items-center gap-3 border-b border-black px-3.5 py-3 last:border-b-0"
            key={amount}
          >
            <span className="grid size-10 shrink-0 place-items-center bg-neutral-100 text-black">
              <Icon name={tone === "green" ? "check" : "wallet"} />
            </span>
            <div className="min-w-0 flex-1">
              <b className="block text-sm">{name}</b>
              <small className="block text-xs text-neutral-600">{detail}</small>
            </div>
            <div className="flex flex-col items-end gap-1">
              <strong>{amount}</strong>
              <Badge tone={tone}>{status}</Badge>
            </div>
            <Icon name="chevron" size={16} />
          </div>
        ))}
      </Card>
    </Screen>
  );
}
