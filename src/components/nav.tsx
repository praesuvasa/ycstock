"use client";
import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

type Me = { id: string; name: string; role: "user" | "admin"; branchScope: string };

const USER_TABS = [
  { href: "/stock", label: "สต็อก", icon: "📝" },
  { href: "/sales", label: "ยอดขาย", icon: "💰" },
];
const ADMIN_TABS = [
  { href: "/", label: "หน้าหลัก", icon: "🏠" },
  { href: "/stock", label: "สต็อก", icon: "📝" },
  { href: "/restock", label: "ต้องเติม", icon: "📦" },
  { href: "/sales", label: "ยอดขาย", icon: "💰" },
  { href: "/cups", label: "ถ้วย", icon: "🥤" },
];
const ADMIN_MENU = [
  { href: "/settings", label: "⚙️ ตั้งค่าสินค้า" },
  { href: "/users", label: "👥 ผู้ใช้" },
  { href: "/audit", label: "📜 Audit Log" },
];

// context เล็ก ๆ ให้ TopBar+BottomNav แชร์ me (โหลดครั้งเดียว)
const MeCtx = React.createContext<Me | null>(null);

export function NavShell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = React.useState<Me | null>(null);
  const path = usePathname();
  React.useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : { user: null })).then((d) => setMe(d.user)).catch(() => setMe(null));
  }, [path]);
  const hide = path === "/login";
  return (
    <MeCtx.Provider value={me}>
      <div className="flex min-h-[100dvh] flex-col">
        {!hide && <TopBar />}
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4 pb-6">{children}</main>
        {!hide && <BottomNav />}
      </div>
    </MeCtx.Provider>
  );
}

function TopBar() {
  const me = React.useContext(MeCtx);
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }
  return (
    <header className="sticky top-0 z-30 border-b border-white/50 bg-white/50 backdrop-blur-xl">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-red to-brand-orange text-sm font-bold text-white">YC</div>
        <div className="leading-tight">
          <div className="text-[15px] font-semibold">Yogurt Culture</div>
          <div className="text-[11px] text-brand-ink/50">
            {me ? `${me.name}${me.role === "admin" ? " · Admin" : me.branchScope !== "all" ? " · " + me.branchScope : ""}` : "ระบบจัดการสต็อก"}
          </div>
        </div>
        <div className="relative ml-auto">
          <button onClick={() => setOpen((o) => !o)} aria-label="เมนู"
            className="grid h-9 w-9 place-items-center rounded-xl border border-white/60 bg-white/50 text-lg">☰</button>
          {open && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
              <div className="absolute right-0 z-40 mt-2 w-48 overflow-hidden rounded-xl border border-black/5 bg-white shadow-glass">
                {me?.role === "admin" && ADMIN_MENU.map((m) => (
                  <Link key={m.href} href={m.href} onClick={() => setOpen(false)}
                    className="block px-4 py-2.5 text-sm hover:bg-brand-cream">{m.label}</Link>
                ))}
                <button onClick={logout} className="block w-full border-t border-black/5 px-4 py-2.5 text-left text-sm text-warn hover:bg-warn/10">ออกจากระบบ</button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function BottomNav() {
  const me = React.useContext(MeCtx);
  const path = usePathname();
  const tabs = me?.role === "admin" ? ADMIN_TABS : USER_TABS;
  return (
    <nav className="sticky bottom-0 z-30 border-t border-white/50 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-3xl">
        {tabs.map((t) => {
          const on = t.href === "/" ? path === "/" : path.startsWith(t.href);
          return (
            <Link key={t.href} href={t.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] transition ${on ? "text-brand-red" : "text-brand-ink/55"}`}>
              <span className="text-lg leading-none">{t.icon}</span>
              <span className={on ? "font-semibold" : ""}>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
