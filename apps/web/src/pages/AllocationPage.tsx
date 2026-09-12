import { Link, useLocation } from "react-router-dom";
import { expenses, type Expense } from "../data/expenses";
import { Screen } from "../components/layout";
import { Avatar, Card, Icon } from "../components/ui";

export function AllocationPage() {
  const location = useLocation();
  const payment =
    (location.state as { payment?: Expense } | null)?.payment ?? expenses[0];
  const splitAmount = payment.amount / 2;
  return (
    <Screen>
      <header className="mb-[-8px] flex items-center justify-between">
        <Link
          to="/payments/new"
          className="grid size-10 place-items-center border border-black"
        >
          <Icon name="back" />
        </Link>
        <b>2 / 2</b>
      </header>
      <h1 className="mb-8 text-center text-xl font-extrabold">
        負担を割り当て
      </h1>
      <Card className="mb-5 grid grid-cols-[1fr_auto] p-4">
        <b className="text-sm">{payment.name}</b>
        <strong className="col-start-1 text-2xl">
          ¥{payment.amount.toLocaleString()}
        </strong>
        <small className="col-start-2 row-start-2 self-end text-xs text-neutral-600">
          {payment.wallet}から支払い
        </small>
      </Card>
      <div className="mb-5 flex gap-2">
        <button className="border border-black bg-white px-3 py-2 text-xs font-bold">
          ＝ 均等にする
        </button>
        <button className="border border-black bg-white px-3 py-2 text-xs font-bold">
          ♙ 大地が全額
        </button>
        <button className="border border-black bg-white px-3 py-2 text-xs font-bold">
          ♙ 愛美が全額
        </button>
      </div>
      <Card>
        <div className="flex min-h-[73px] items-center gap-3 border-b border-black p-3.5">
          <Avatar />
          <div className="flex-1">
            <b className="block text-sm">大地</b>
            <small className="block text-xs text-neutral-600">負担額</small>
          </div>
          <div className="flex min-w-28 justify-between border border-black px-3 py-2 text-sm">
            ¥ <b>{splitAmount.toLocaleString()}</b>
          </div>
        </div>
        <div className="flex min-h-[73px] items-center gap-3 p-3.5">
          <Avatar name="愛美" />
          <div className="flex-1">
            <b className="block text-sm">愛美</b>
            <small className="block text-xs text-neutral-600">負担額</small>
          </div>
          <div className="flex min-w-28 justify-between border border-black px-3 py-2 text-sm">
            ¥ <b>{splitAmount.toLocaleString()}</b>
          </div>
        </div>
      </Card>
      <Card className="mt-5 bg-neutral-100 p-4">
        <span className="flex justify-between text-sm text-neutral-600">
          負担額の合計 <b>¥{payment.amount.toLocaleString()}</b>
        </span>
        <small className="mt-3 flex justify-between text-xs font-bold">
          割り当てが完了しています <b>残り ¥0</b>
        </small>
      </Card>
      <Link
        className="mt-9 grid h-12 place-items-center bg-black text-sm font-bold text-white"
        to="/invoices"
      >
        請求を発行する
      </Link>
    </Screen>
  );
}
