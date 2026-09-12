import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Icon, type IconName } from "./ui";

type NavigationKey = "home" | "records" | "invoices" | "mypage";
export function BottomNav({ active }: { active: NavigationKey }) {
  const links: [string, string, IconName, NavigationKey][] = [
    ["/home", "ホーム", "home", "home"],
    ["/records", "レコード", "wallet", "records"],
    ["/invoices", "インボイス", "receipt", "invoices"],
  ];
  return (
    <nav
      className="fixed right-0 bottom-0 left-0 grid h-20 grid-cols-3 bg-black px-6"
      aria-label="メインナビゲーション"
    >
      {links.map(([to, label, icon, key]) => (
        <NavLink
          key={to}
          to={to}
          className={`flex flex-col items-center justify-center gap-1 text-[11px] font-bold ${active === key ? "text-white after:size-1.5 after:rounded-full after:bg-accent" : "text-white"}`}
        >
          <Icon name={icon} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
export function Screen({
  children,
  active,
  className = "",
}: {
  children: ReactNode;
  active?: NavigationKey;
  className?: string;
}) {
  return (
    <main
      className={`relative mx-auto h-svh w-full max-w-2xl overflow-y-auto bg-white pb-20 ${className}`}
    >
      <div className="px-6 pt-[68px] pb-7">{children}</div>
      {active && <BottomNav active={active} />}
    </main>
  );
}
export function Heading({
  eyebrow,
  title,
  right,
}: {
  eyebrow: string;
  title: string;
  right?: ReactNode;
}) {
  return (
    <header className="mb-8 flex items-center justify-between">
      <div>
        {eyebrow && (
          <p className="mb-1 text-xs font-bold text-black">{eyebrow}</p>
        )}
        <h1 className="m-0 text-[34px] leading-tight font-extrabold tracking-[-0.06em] text-black">
          {title}
        </h1>
      </div>
      {right}
    </header>
  );
}
