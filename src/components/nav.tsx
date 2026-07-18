"use client";
import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Role, BranchScope } from "@/lib/types";

export type Me = { id: string; name: string; role: Role; branchScope: BranchScope };

type Tab = { href: string; label: string; icon: string };

const USER_TABS: Tab[] = [
  { href: "/stock", label: "สต็อก", icon: "📝" },
  { href: "/stock-in", label: "สินค้าเข้า", icon: "🚚" },
  { href: "/sales", label: "ยอดขาย", icon: "💰" },
  { href: "/requisitions", label: "ขอเบิกสินค้า", icon: "🙋" },
];
const ADMIN_TABS: Tab[] = [
  { href: "/", label: "หน้าหลัก", icon: "🏠" },
  { href: "/stock", label: "สต็อก", icon: "📝" },
  { href: "/stock-in", label: "สินค้าเข้า", icon: "🚚" },
  { href: "/restock", label: "ต้องเติม", icon: "📦" },
  { href: "/sales", label: "ยอดขาย", icon: "💰" },
  { href: "/cups", label: "สรุปจำนวน", icon: "🥤" },
  { href: "/requisitions", label: "คำขอเบิก", icon: "🙋" },
];
const ADMIN_MENU: Tab[] = [
  { href: "/settings", label: "ตั้งค่าสินค้า", icon: "⚙️" },
  { href: "/users", label: "ผู้ใช้", icon: "👥" },
  { href: "/audit", label: "Audit Log", icon: "📜" },
];
// role "restock" — เข้าได้แค่ 2 หน้า (เติมของ/สั่งผลิต + คำขอเบิก) ไม่เห็นเมนูอื่นเลย
const RESTOCK_TABS: Tab[] = [
  { href: "/restock", label: "เติมของ/สั่งผลิต", icon: "📦" },
  { href: "/requisitions", label: "คำขอเบิก", icon: "🙋" },
];
const tabsForRole = (role: Role | undefined): Tab[] =>
  role === "admin" ? ADMIN_TABS : role === "restock" ? RESTOCK_TABS : USER_TABS;

// context ให้ทุกส่วน (nav + หน้า) แชร์ me (โหลดครั้งเดียว)
const MeCtx = React.createContext<Me | null>(null);
/** อ่านข้อมูลผู้ใช้ที่ล็อกอิน (null = ยังไม่โหลด/ไม่ได้ล็อกอิน) — ใช้ในหน้าเพื่อจำกัดสาขา */
export function useMe(): Me | null {
  return React.useContext(MeCtx);
}

const ROLE_LABEL_TH: Record<Role, string> = { admin: "แอดมิน", user: "พนักงาน", restock: "จนท. Restock" };
const scopeLabel = (me: Me | null): string =>
  !me ? "ระบบจัดการสต็อก"
    : me.role === "admin" && me.branchScope === "all" ? "ผู้ดูแลระบบ · ทุกสาขา"
    : me.branchScope !== "all" ? `${ROLE_LABEL_TH[me.role]} · สาขา ${me.branchScope}`
    : `${ROLE_LABEL_TH[me.role]} · ทุกสาขา`;

function useLogout() {
  const router = useRouter();
  return React.useCallback(async () => {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }, [router]);
}

export function NavShell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = React.useState<Me | null>(null);
  const path = usePathname();
  React.useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => setMe(d.user))
      .catch(() => setMe(null));
  }, [path]);

  if (path === "/login") return <>{children}</>;

  return (
    <MeCtx.Provider value={me}>
      <Sidebar />
      <TopBar />
      <main className="lg:pl-64 print:pl-0">
        <div className="mx-auto w-full max-w-3xl px-4 py-5 pb-28 lg:max-w-4xl lg:px-8 lg:py-8 lg:pb-12 print:max-w-none print:p-0">
          {children}
        </div>
      </main>
      <BottomNav />
    </MeCtx.Provider>
  );
}

/* ── โลโก้ + ชื่อผู้ใช้ (ใช้ร่วม sidebar / topbar) ── */
function Brand({ me, compact }: { me: Me | null; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className={`grid ${compact ? "h-9 w-9 rounded-xl text-sm" : "h-11 w-11 rounded-2xl text-base"} place-items-center bg-gradient-to-br from-brand-red to-brand-orange font-bold text-white shadow-glass`}>
        YC
      </div>
      <div className="leading-tight">
        <div className={compact ? "text-[15px] font-semibold" : "text-base font-semibold"}>Yogurt Culture</div>
        <div className="text-[11px] text-brand-ink/50">{scopeLabel(me)}</div>
      </div>
    </div>
  );
}

function NavItem({ tab, active, onClick }: { tab: Tab; active: boolean; onClick?: () => void }) {
  return (
    <Link
      href={tab.href}
      onClick={onClick}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
        active
          ? "bg-brand-ink text-white shadow-glass"
          : "text-brand-ink/70 hover:bg-white/70 hover:text-brand-ink"
      }`}
    >
      <span className="text-lg leading-none">{tab.icon}</span>
      <span>{tab.label}</span>
    </Link>
  );
}

/* ── Desktop: sidebar แนวตั้ง (≥lg) ── */
function Sidebar() {
  const me = React.useContext(MeCtx);
  const path = usePathname();
  const logout = useLogout();
  const tabs = tabsForRole(me?.role);
  const isOn = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/60 bg-white/55 px-4 py-5 backdrop-blur-xl lg:flex print:hidden">
      <Brand me={me} />

      <nav className="mt-7 flex flex-col gap-1">
        <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-brand-ink/35">เมนู</div>
        {tabs.map((t) => (
          <NavItem key={t.href} tab={t} active={isOn(t.href)} />
        ))}
      </nav>

      {me?.role === "admin" && (
        <nav className="mt-5 flex flex-col gap-1">
          <div className="px-3 pb-1 text-[11px] font-medium uppercase tracking-wide text-brand-ink/35">จัดการระบบ</div>
          {ADMIN_MENU.map((t) => (
            <NavItem key={t.href} tab={t} active={isOn(t.href)} />
          ))}
        </nav>
      )}

      <button
        onClick={logout}
        className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-warn transition hover:bg-warn/10"
      >
        <span className="text-lg leading-none">↩︎</span>
        <span>ออกจากระบบ</span>
      </button>
    </aside>
  );
}

/* ── Mobile: top bar + เมนู ☰ (<lg) ── */
function TopBar() {
  const me = React.useContext(MeCtx);
  const logout = useLogout();
  const [open, setOpen] = React.useState(false);
  return (
    <header className="sticky top-0 z-30 border-b border-white/50 bg-white/55 backdrop-blur-xl lg:hidden print:hidden">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <Brand me={me} compact />
        <div className="relative ml-auto">
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label="เมนู"
            className="grid h-10 w-10 place-items-center rounded-xl border border-white/60 bg-white/60 text-lg"
          >
            ☰
          </button>
          {open && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
              <div className="absolute right-0 z-40 mt-2 w-52 overflow-hidden rounded-2xl border border-white/60 bg-white/95 shadow-glass backdrop-blur-xl">
                {me?.role === "admin" &&
                  ADMIN_MENU.map((m) => (
                    <Link
                      key={m.href}
                      href={m.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-3 text-sm hover:bg-brand-cream"
                    >
                      <span>{m.icon}</span>
                      <span>{m.label}</span>
                    </Link>
                  ))}
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-2.5 border-t border-black/5 px-4 py-3 text-left text-sm text-warn hover:bg-warn/10"
                >
                  <span>↩︎</span>
                  <span>ออกจากระบบ</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/* ── Mobile: bottom tab nav (<lg) ── */
function BottomNav() {
  const me = React.useContext(MeCtx);
  const path = usePathname();
  const tabs = tabsForRole(me?.role);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/50 bg-white/75 backdrop-blur-xl lg:hidden print:hidden">
      <div className="mx-auto flex max-w-3xl">
        {tabs.map((t) => {
          const on = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] transition ${
                on ? "text-brand-red" : "text-brand-ink/55"
              }`}
            >
              <span className="text-lg leading-none">{t.icon}</span>
              <span className={on ? "font-semibold" : ""}>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
