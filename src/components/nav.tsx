"use client";
import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Role, BranchScope } from "@/lib/types";

export type Me = { id: string; name: string; role: Role; branchScope: BranchScope; allowanceEnabled?: boolean };

type IconKey =
  | "home" | "clipboard" | "truck" | "inbox" | "package" | "banknote" | "bank" | "cup"
  | "request" | "calendar" | "undo" | "ticket" | "flag" | "sliders" | "users"
  | "megaphone" | "list" | "logout";

// ไอคอนเส้นเรียบ วาดเอง 24x24 — ไม่ใช้ emoji (ขนาด/สีต่างกันตามอุปกรณ์ คุมไม่ได้)
// และไม่ดึงไลบรารีไอคอนเข้ามาเพื่อ 19 อัน (bundle โตเกินจำเป็น)
const ICON_PATHS: Record<IconKey, string> = {
  home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z",
  clipboard: "M5 5h14v16H5zM9 3h6v4H9zM9 12h6M9 16h4",
  truck: "M3 7h11v9H3zM14 10h4l3 3v3h-7M7 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4M17.5 20a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  inbox: "M4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5M8 10l4 4 4-4M12 3v11",
  package: "M12 3 4 7v10l8 4 8-4V7zM4 7l8 4 8-4M12 11v10",
  banknote: "M3 6h18v12H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5",
  bank: "M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18",
  cup: "M6 6h12l-1.2 13a2 2 0 0 1-2 1.8H9.2a2 2 0 0 1-2-1.8zM8.5 10h7",
  request: "M12 3v10M9 6l3-3 3 3M4 14v4a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4",
  calendar: "M3.5 5h17v16h-17zM3.5 10h17M8 3v4M16 3v4",
  undo: "M4 9h11a5 5 0 0 1 0 10h-5M8 5 4 9l4 4",
  ticket: "M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4zM14 6v12",
  flag: "M6 21V4M6 5h11l-2.5 3.5L17 12H6",
  sliders: "M4 7h16M4 12h16M4 17h16M9 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4M15 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4M8 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  users: "M9 11.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4M3 20a6 6 0 0 1 12 0M16 5.5a3.2 3.2 0 0 1 0 6.4M17 20a6 6 0 0 0-2.2-4.6",
  megaphone: "M4 10a1 1 0 0 1 1-1h3l7-4v14l-7-4H5a1 1 0 0 1-1-1zM18 9a4 4 0 0 1 0 6",
  list: "M9 6h11M9 12h11M9 18h11M4.5 7.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4M4.5 13.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4M4.5 19.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4",
  logout: "M15 17v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v2M10 12h11M18 9l3 3-3 3",
};

function Icon({ name, size = 18 }: { name: IconKey; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className="shrink-0"
    >
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}

// children = เมนูกลุ่ม (กดแล้วกางออก) — ตัวกลุ่มเองไม่มี href
type Tab = { href?: string; label: string; icon: IconKey; children?: Tab[] };

// ลำดับเมนูพนักงาน — แพรกำหนด 2026-07-27 ให้เรียงตามลำดับงานจริงในวัน
// (รับของ → นับสต็อก → ปิดยอด → ส่งเงิน) ของที่ทำนาน ๆ ครั้งไปอยู่ท้าย
// หน้าประวัติ 2 อันยุบเป็นกลุ่มเดียว เพราะเป็นของ "ย้อนดู" ไม่ใช่งานประจำวัน
const USER_TABS: Tab[] = [
  { href: "/confirm-receipt", label: "ยืนยันรับของ", icon: "inbox" },
  { href: "/stock", label: "เช็คสต็อก", icon: "clipboard" },
  { href: "/sales", label: "รายงานยอดขาย", icon: "banknote" },
  { href: "/cash-remittance", label: "เงินสด", icon: "bank" },
  { href: "/expiry", label: "ตรวจสอบวันหมดอายุ", icon: "calendar" },
  { href: "/requisitions", label: "ขอเบิกสินค้า", icon: "request" },
  { href: "/allowance", label: "สิทธิ์ซื้อของ", icon: "ticket" },
  {
    label: "ประวัติ", icon: "list",
    children: [
      { href: "/stock-in", label: "ประวัติสินค้าเข้า", icon: "truck" },
      { href: "/returns", label: "ประวัติส่งคืน / ของเสีย", icon: "undo" },
    ],
  },
];
const ADMIN_TABS: Tab[] = [
  { href: "/", label: "หน้าหลัก", icon: "home" },
  { href: "/stock", label: "สต็อก", icon: "clipboard" },
  { href: "/stock-in", label: "สินค้าเข้า", icon: "truck" },
  { href: "/confirm-receipt", label: "รับของ", icon: "inbox" },
  { href: "/restock", label: "ต้องเติม", icon: "package" },
  { href: "/sales", label: "ยอดขาย", icon: "banknote" },
  { href: "/cash-remittance", label: "โอนเงินสด", icon: "bank" },
  { href: "/cups", label: "สรุปจำนวน", icon: "cup" },
  { href: "/requisitions", label: "คำขอเบิก", icon: "request" },
  { href: "/expiry", label: "วันหมดอายุ", icon: "calendar" },
  { href: "/returns", label: "ส่งคืน/ของเสีย", icon: "undo" },
  { href: "/allowance", label: "สิทธิ์ซื้อของ", icon: "ticket" },
];
const ADMIN_MENU: Tab[] = [
  { href: "/admin-flags", label: "รายการรอตรวจสอบ", icon: "flag" },
  { href: "/settings", label: "ตั้งค่าสินค้า", icon: "sliders" },
  { href: "/users", label: "ผู้ใช้", icon: "users" },
  { href: "/notices", label: "ประกาศ", icon: "megaphone" },
  { href: "/audit", label: "Audit Log", icon: "list" },
];
// role "restock" — เข้าได้แค่ 2 หน้า (เติมของ/สั่งผลิต + คำขอเบิก) ไม่เห็นเมนูอื่นเลย
const RESTOCK_TABS: Tab[] = [
  { href: "/restock", label: "เติมของ/สั่งผลิต", icon: "package" },
  { href: "/requisitions", label: "คำขอเบิก", icon: "request" },
];
// เมนู "สิทธิ์ซื้อของ" โชว์เฉพาะคนที่แอดมินเปิดสิทธิ์ให้แล้ว (v1.13)
// ซ่อนไปเลยดีกว่าโชว์แล้วกดไม่ได้ — พนักงานบางคนยังไม่ได้รับสิทธิ์ กันคำถาม "ทำไมหนูไม่มี"
const tabsForMe = (me: Me | null): Tab[] => {
  const base = me?.role === "admin" ? ADMIN_TABS : me?.role === "restock" ? RESTOCK_TABS : USER_TABS;
  return me?.allowanceEnabled ? base : base.filter((t) => t.href !== "/allowance");
};


// context ให้ทุกส่วน (nav + หน้า) แชร์ me (โหลดครั้งเดียว)
const MeCtx = React.createContext<Me | null>(null);
/** อ่านข้อมูลผู้ใช้ที่ล็อกอิน (null = ยังไม่โหลด/ไม่ได้ล็อกอิน) — ใช้ในหน้าเพื่อจำกัดสาขา */
export function useMe(): Me | null {
  return React.useContext(MeCtx);
}

// จำนวนคำขอเบิกที่ยังไม่มีใครเปิดดู — โชว์ badge ที่เมนู "ขอเบิกสินค้า" (เฉพาะ restock/admin)
const UnseenReqCtx = React.createContext<number>(0);
export function useUnseenRequisitions(): number {
  return React.useContext(UnseenReqCtx);
}

// จำนวนรายการยืนยันรับของที่ยังค้าง (v1.9) — โชว์ badge ที่เมนู "รับของ" (เฉพาะ role user — ผูกสาขาเดียว)
const PendingReceiptCtx = React.createContext<number>(0);
export function usePendingReceipt(): number {
  return React.useContext(PendingReceiptCtx);
}

// สาขาที่ยังไม่ได้ตรวจวันหมดอายุ (v1.12) — ขึ้นเฉพาะวันอังคาร/ศุกร์ ที่เป็นรอบตรวจ
// พนักงาน = 0/1 (สาขาตัวเอง) · แอดมิน = จำนวนสาขาที่ยังไม่บันทึก
export const EXPIRY_SAVED_EVENT = "yc:expiry-saved";
const ExpiryDueCtx = React.createContext<number>(0);
export function useExpiryDue(): number {
  return React.useContext(ExpiryDueCtx);
}

// จำนวนรายการรอตรวจสอบของแอดมิน (v1.9) — โชว์ badge ที่เมนู "รายการรอตรวจสอบ" (admin only)
const AdminFlagsCtx = React.createContext<number>(0);
export function useAdminFlagsCount(): number {
  return React.useContext(AdminFlagsCtx);
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
  const [unseenReq, setUnseenReq] = React.useState(0);
  const [pendingReceipt, setPendingReceipt] = React.useState(0);
  const [adminFlags, setAdminFlags] = React.useState(0);
  const [expiryDue, setExpiryDue] = React.useState(0);
  const path = usePathname();
  React.useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => setMe(d.user))
      .catch(() => setMe(null));
  }, [path]);

  // เช็คจำนวนคำขอเบิกที่ยังไม่เห็น ทุกครั้งที่เปลี่ยนหน้า (เคลียร์อัตโนมัติหลังเปิดหน้า "ขอเบิกสินค้า")
  React.useEffect(() => {
    if (me?.role !== "restock" && me?.role !== "admin") return;
    fetch("/api/requisitions/unseen-count")
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => setUnseenReq(d.count ?? 0))
      .catch(() => {});
  }, [path, me?.role]);

  // จำนวนรายการยืนยันรับของที่ยังค้าง — เฉพาะ role user (ผูกสาขาเดียวอยู่แล้ว)
  React.useEffect(() => {
    if (me?.role !== "user" || me.branchScope === "all") return;
    fetch(`/api/confirm-receipt/pending-count?branch=${me.branchScope}`)
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => setPendingReceipt(d.count ?? 0))
      .catch(() => {});
  }, [path, me?.role, me?.branchScope]);

  // จำนวนรายการรอตรวจสอบของแอดมิน
  React.useEffect(() => {
    if (me?.role !== "admin") return;
    fetch("/api/admin-flags/count")
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => setAdminFlags(d.count ?? 0))
      .catch(() => {});
  }, [path, me?.role]);

  // สาขาที่ยังไม่ได้ตรวจวันหมดอายุ — role restock ไม่เกี่ยวกับงานนี้ (เห็นแค่ 2 หน้า) จึงไม่ต้องยิง
  const refreshExpiryDue = React.useCallback(() => {
    if (!me || me.role === "restock") return;
    fetch("/api/expiry-checks/pending-count")
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => setExpiryDue(d.count ?? 0))
      .catch(() => {});
  }, [me]);
  React.useEffect(() => { refreshExpiryDue(); }, [path, refreshExpiryDue]);
  // หน้าตรวจยิง event นี้หลังบันทึกสำเร็จ — ไม่งั้น badge จะค้างอยู่จนกว่าจะเปลี่ยนหน้า
  // ทำให้พนักงานนึกว่ายังบันทึกไม่ติดแล้วกดซ้ำ
  React.useEffect(() => {
    window.addEventListener(EXPIRY_SAVED_EVENT, refreshExpiryDue);
    return () => window.removeEventListener(EXPIRY_SAVED_EVENT, refreshExpiryDue);
  }, [refreshExpiryDue]);

  if (path === "/login") return <>{children}</>;

  return (
    <MeCtx.Provider value={me}>
      <UnseenReqCtx.Provider value={unseenReq}>
        <PendingReceiptCtx.Provider value={pendingReceipt}>
          <AdminFlagsCtx.Provider value={adminFlags}>
            <ExpiryDueCtx.Provider value={expiryDue}>
            <Sidebar />
            <TopBar />
            <main className="lg:pl-64 print:pl-0">
              <div className="mx-auto w-full max-w-3xl px-4 py-5 pb-28 lg:max-w-4xl lg:px-8 lg:py-8 lg:pb-12 print:max-w-none print:p-0">
                {children}
              </div>
            </main>
            <BottomNav />
            </ExpiryDueCtx.Provider>
          </AdminFlagsCtx.Provider>
        </PendingReceiptCtx.Provider>
      </UnseenReqCtx.Provider>
    </MeCtx.Provider>
  );
}

/* ── โลโก้ + ชื่อผู้ใช้ (ใช้ร่วม sidebar / topbar) ── */
function Brand({ me, compact }: { me: Me | null; compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/logo-yc.png"
        alt="Yogurt Culture"
        className={compact ? "h-7 w-auto" : "h-9 w-auto"}
      />
      <div className="leading-tight">
        <div className={compact ? "text-[15px] font-semibold" : "text-base font-semibold"}>ระบบจัดการสต็อก</div>
        <div className="text-[11px] text-brand-ink/50">{scopeLabel(me)}</div>
      </div>
    </div>
  );
}

const ITEM_CLS = (active: boolean) =>
  `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-[13px] font-medium transition ${
    active ? "bg-brand-ink text-white shadow-glass" : "text-brand-ink/70 hover:bg-white/70 hover:text-brand-ink"
  }`;

const Chevron = ({ open }: { open: boolean }) => (
  <svg
    width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

/** เมนูกลุ่มในแถบซ้าย — กางเองอัตโนมัติเมื่ออยู่ในหน้าลูก จะได้ไม่ต้องกดซ้ำทุกครั้ง */
function NavGroup({ tab, isOn, onNavigate }: { tab: Tab; isOn: (href: string) => boolean; onNavigate?: () => void }) {
  const hasActiveChild = (tab.children ?? []).some((c) => c.href && isOn(c.href));
  const [open, setOpen] = React.useState(hasActiveChild);
  React.useEffect(() => { if (hasActiveChild) setOpen(true); }, [hasActiveChild]);
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} className={ITEM_CLS(false)} aria-expanded={open}>
        <Icon name={tab.icon} />
        <span className="flex-1 truncate">{tab.label}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className="mt-px flex flex-col gap-px pl-4">
          {(tab.children ?? []).map((c) => (
            <NavItem key={c.href} tab={c} active={!!c.href && isOn(c.href)} onClick={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function NavItem({ tab, active, onClick, badge }: { tab: Tab; active: boolean; onClick?: () => void; badge?: number }) {
  return (
    <Link
      href={tab.href ?? "#"}
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition ${
        active
          ? "bg-brand-ink text-white shadow-glass"
          : "text-brand-ink/70 hover:bg-white/70 hover:text-brand-ink"
      }`}
    >
      <Icon name={tab.icon} />
      <span className="flex-1 truncate">{tab.label}</span>
      {!!badge && (
        <span className={`grid h-5 min-w-[20px] place-items-center rounded-full px-1 text-[11px] font-semibold ${
          active ? "bg-white text-brand-red" : "bg-brand-red text-white"
        }`}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

/* ── Desktop: sidebar แนวตั้ง (≥lg) ── */
function Sidebar() {
  const me = React.useContext(MeCtx);
  const unseenReq = React.useContext(UnseenReqCtx);
  const pendingReceipt = React.useContext(PendingReceiptCtx);
  const adminFlags = React.useContext(AdminFlagsCtx);
  const expiryDue = React.useContext(ExpiryDueCtx);
  const path = usePathname();
  const logout = useLogout();
  const tabs = tabsForMe(me);
  const isOn = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const tabBadge = (href: string) =>
    href === "/requisitions" ? unseenReq
      : href === "/confirm-receipt" ? pendingReceipt
      : href === "/expiry" ? expiryDue
      : undefined;

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-white/60 bg-white/55 px-4 py-5 backdrop-blur-xl lg:flex print:hidden">
      <div className="shrink-0">
        <Brand me={me} />
      </div>

      {/* เมนูยาวเกินจอแล้ว (แอดมิน 13 + จัดการระบบ 5) — ต้องเลื่อนได้ ไม่งั้นกลุ่มล่างกดไม่ถึง */}
      <div className="mt-5 min-h-0 flex-1 overflow-y-auto">
        <nav className="flex flex-col gap-px">
          <div className="px-2.5 pb-1 text-[10.5px] font-medium uppercase tracking-wide text-brand-ink/35">เมนู</div>
          {tabs.map((t) =>
            t.children
              ? <NavGroup key={t.label} tab={t} isOn={isOn} />
              : <NavItem key={t.href} tab={t} active={isOn(t.href!)} badge={tabBadge(t.href!)} />
          )}
        </nav>

        {me?.role === "admin" && (
          <nav className="mt-3.5 flex flex-col gap-px">
            <div className="px-2.5 pb-1 text-[10.5px] font-medium uppercase tracking-wide text-brand-ink/35">จัดการระบบ</div>
            {ADMIN_MENU.map((t) => (
              <NavItem key={t.href} tab={t} active={isOn(t.href!)} badge={t.href === "/admin-flags" ? adminFlags : undefined} />
            ))}
          </nav>
        )}
      </div>

      <button
        onClick={logout}
        className="mt-2.5 flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium text-warn transition hover:bg-warn/10"
      >
        <Icon name="logout" />
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
                      href={m.href!}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] hover:bg-brand-cream"
                    >
                      <Icon name={m.icon} size={17} />
                      <span>{m.label}</span>
                    </Link>
                  ))}
                <button
                  onClick={logout}
                  className="flex w-full items-center gap-2.5 border-t border-black/5 px-4 py-2.5 text-left text-[13px] text-warn hover:bg-warn/10"
                >
                  <Icon name="logout" size={17} />
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
  const unseenReq = React.useContext(UnseenReqCtx);
  const pendingReceipt = React.useContext(PendingReceiptCtx);
  const expiryDue = React.useContext(ExpiryDueCtx);
  const path = usePathname();
  const tabs = tabsForMe(me);
  // กลุ่มที่กางอยู่ (มือถือกางในแถบล่างไม่ได้ ต้องเด้งขึ้นมาเหนือแถบแทน)
  const [openGroup, setOpenGroup] = React.useState<string | null>(null);
  React.useEffect(() => { setOpenGroup(null); }, [path]);

  const isOn = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const badgeOf = (href?: string) =>
    href === "/requisitions" ? unseenReq
      : href === "/confirm-receipt" ? pendingReceipt
      : href === "/expiry" ? expiryDue
      : 0;

  const cls = (on: boolean) =>
    `flex min-w-[68px] flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] transition ${
      on ? "text-brand-red" : "text-brand-ink/55"
    }`;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-white/50 bg-white/75 backdrop-blur-xl lg:hidden print:hidden">
      {openGroup && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpenGroup(null)} />
          <div className="absolute bottom-full left-0 right-0 z-40 border-t border-white/60 bg-white/95 backdrop-blur-xl">
            {(tabs.find((t) => t.label === openGroup)?.children ?? []).map((c) => (
              <Link
                key={c.href}
                href={c.href ?? "#"}
                onClick={() => setOpenGroup(null)}
                className={`flex items-center gap-2.5 px-4 py-3 text-[13px] ${
                  c.href && isOn(c.href) ? "text-brand-red" : "text-brand-ink"
                }`}
              >
                <Icon name={c.icon} size={17} />
                <span>{c.label}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* แท็บเยอะเกินจอมือถือ — เลื่อนแนวนอนแทนการบีบจนกดไม่โดน (min-w กันแตะพลาด) */}
      <div className="mx-auto flex max-w-3xl overflow-x-auto">
        {tabs.map((t) => {
          if (t.children) {
            const on = t.children.some((c) => c.href && isOn(c.href));
            return (
              <button
                key={t.label}
                type="button"
                onClick={() => setOpenGroup((g) => (g === t.label ? null : t.label))}
                className={cls(on || openGroup === t.label)}
              >
                <span className="relative leading-none"><Icon name={t.icon} size={19} /></span>
                <span className={`whitespace-nowrap ${on ? "font-semibold" : ""}`}>{t.label}</span>
              </button>
            );
          }
          const on = isOn(t.href!);
          const badge = badgeOf(t.href);
          return (
            <Link key={t.href} href={t.href!} className={cls(on)}>
              <span className="relative leading-none">
                <Icon name={t.icon} size={19} />
                {badge > 0 && (
                  <span className="absolute -right-2 -top-1.5 grid h-4 min-w-[16px] place-items-center rounded-full bg-brand-red px-0.5 text-[9px] font-bold text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </span>
              <span className={`whitespace-nowrap ${on ? "font-semibold" : ""}`}>{t.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
