"use client";
import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Role, BranchScope } from "@/lib/types";
import { unitBrand, branchBrandLabel, isDualBrandBranch } from "@/lib/units";

export type Me = {
  id: string; name: string; role: Role; branchScope: BranchScope;
  allowanceEnabled?: boolean; mustEnrollFace?: boolean;
  // หน่วยงาน (v1.24) — ฝ่ายผลิตเห็นแค่เมนูลงเวลา ไม่เห็นงานหน้าร้าน
  workUnit?: "store" | "production";
  // senior staff — แก้ตารางกะของสาขาตัวเองได้
  isSenior?: boolean;
  // เมนูที่แอดมินยังไม่เปิดใช้ — ซ่อนทั้งเมนู เช็คลิสต์ และ badge พร้อมกัน
  features?: { expiryCheck?: boolean; staffTimeMenu?: boolean };
};

type IconKey =
  | "home" | "clipboard" | "truck" | "inbox" | "package" | "banknote" | "bank" | "cup"
  | "request" | "calendar" | "undo" | "ticket" | "flag" | "sliders" | "users"
  | "megaphone" | "list" | "lock" | "chat" | "clock" | "logout";

// ไอคอนเส้นเรียบ วาดเอง 24x24 — ไม่ใช้ emoji (ขนาด/สีต่างกันตามอุปกรณ์ คุมไม่ได้)
// และไม่ดึงไลบรารีไอคอนเข้ามาเพื่อ 19 อัน (bundle โตเกินจำเป็น)
const ICON_PATHS: Record<IconKey, string> = {
  home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z",
  clipboard: "M5 5h14v16H5zM9 3h6v4H9zM9 12h6M9 16h4",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3.5 2",
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
  lock: "M6 11h12v10H6zM9 11V7.5a3 3 0 0 1 6 0V11M12 15v2",
  chat: "M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5 4z",
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
  { href: "/store", label: "หน้าหลัก", icon: "home" },
  { href: "/confirm-receipt", label: "ยืนยันรับของ", icon: "inbox" },
  { href: "/stock", label: "เช็คสต็อก", icon: "clipboard" },
  { href: "/sales", label: "รายงานยอดขาย", icon: "banknote" },
  { href: "/cash-remittance", label: "เงินสด", icon: "bank" },
  { href: "/expiry", label: "ตรวจสอบวันหมดอายุ", icon: "calendar" },
  { href: "/requisitions", label: "ขอเบิกสินค้า", icon: "request" },
  {
    label: "ประวัติ", icon: "list",
    children: [
      { href: "/stock-in", label: "ประวัติสินค้าเข้า", icon: "truck" },
      { href: "/returns", label: "ประวัติส่งคืน / ของเสีย", icon: "undo" },
    ],
  },
];
const ADMIN_TABS: Tab[] = [
  { href: "/store", label: "หน้าหลัก", icon: "home" },
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
];
const ADMIN_MENU: Tab[] = [
  { href: "/admin-flags", label: "รายการรอตรวจสอบ", icon: "flag" },
  { href: "/stock-overview", label: "สรุปสต็อกคงเหลือ", icon: "clipboard" },
  { href: "/settings", label: "ตั้งค่าสินค้า", icon: "sliders" },
  { href: "/users", label: "ผู้ใช้", icon: "users" },
  { href: "/timeclock-report", label: "รายงานลงเวลา", icon: "clock" },
  { href: "/timeclock-admin", label: "ตั้งค่าระบบ", icon: "sliders" },
  { href: "/notices", label: "ประกาศ", icon: "megaphone" },
  { href: "/audit", label: "Audit Log", icon: "list" },
];
// role "restock" — เข้าได้แค่ 2 หน้า (เติมของ/สั่งผลิต + คำขอเบิก) ไม่เห็นเมนูอื่นเลย
const RESTOCK_TABS: Tab[] = [
  { href: "/restock", label: "เติมของ/สั่งผลิต", icon: "package" },
  { href: "/requisitions", label: "คำขอเบิก", icon: "request" },
];
const PRODUCTION_TABS: Tab[] = [
  { href: "/yogi", label: "หน้าหลัก", icon: "home" },
];
const tabsForMe = (me: Me | null): Tab[] => {
  // ฝ่ายผลิต — เห็นแค่หน้าหลักของหน่วยตัวเอง (ยังไม่มีเมนูงานผลิตในระบบ)
  // เมนูลงเวลาอยู่ในกลุ่ม "ข้อมูลของฉัน" อยู่แล้ว ไม่ต้องซ้ำอีกที่
  if (me?.workUnit === "production" && me.role !== "admin") return PRODUCTION_TABS;
  const base = me?.role === "admin" ? ADMIN_TABS : me?.role === "restock" ? RESTOCK_TABS : USER_TABS;
  // ยังไม่เปิดใช้ตรวจวันหมดอายุ = ตัดออกจากเมนูไปเลย (แพรสั่ง 2026-07-28)
  // ระหว่างนี้ของที่ต้องส่งคืนให้ไปกรอกที่หน้า "ส่งคืน" ตามเดิม
  if (me?.features?.expiryCheck) return base;
  return base.filter((t) => t.href !== "/expiry");
};

// กลุ่ม "ข้อมูลของฉัน" — ของส่วนตัวรายคน แยกจากเมนูงานประจำวัน (แพรจัด 2026-07-27)
// "สิทธิ์ซื้อของ" โชว์เฉพาะคนที่แอดมินเปิดสิทธิ์ให้แล้ว — ซ่อนไปเลยดีกว่าโชว์แล้วกดไม่ได้
const accountMenuFor = (me: Me | null): Tab[] => [
  // ลงเวลา + ตารางงาน ยังไม่เปิดให้พนักงานใช้ (แพรสั่ง 2026-07-31 — รอสร้างบัญชี/ลงทะเบียนใบหน้าก่อน)
  // แอดมินเห็นตลอดเพื่อทดสอบ · เปิดให้พนักงานได้ที่หน้า "ตั้งค่าระบบ" ไม่ต้อง deploy ใหม่ (แพรยืนยัน 2026-08-04 — โชว์ที่แอดมินได้)
  ...(me?.role === "admin" || me?.features?.staffTimeMenu
    ? [
        { href: "/time-clock", label: "ลงเวลาเข้า-ออกงาน", icon: "clock" as IconKey },
        { href: "/schedule", label: "ตารางงาน", icon: "calendar" as IconKey },
      ]
    : []),
  { href: "/set-pin", label: "เปลี่ยนรหัสของฉัน", icon: "lock" },
  // senior เห็นประวัติการทำงาน + แก้ยอดซ้ำ/ย้อนหลังของสาขาตัวเอง (แพรสั่ง 2026-08-06)
  // admin เห็นทั้งคู่ผ่าน "จัดการระบบ" อยู่แล้ว ไม่ต้องซ้ำเมนู
  ...(me?.isSenior && me.role !== "admin"
    ? [
        { href: "/audit", label: "ประวัติการทำงาน", icon: "list" as IconKey },
        { href: "/admin-flags", label: "แก้ยอดซ้ำ/ย้อนหลัง", icon: "flag" as IconKey },
      ]
    : []),
  ...(me?.allowanceEnabled ? [{ href: "/allowance", label: "สิทธิ์ซื้อของ", icon: "ticket" as IconKey }] : []),
  { href: "/feedback", label: "ความคิดเห็นและข้อเสนอแนะ", icon: "chat" },
];


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

// จำนวนความคิดเห็นที่แอดมินยังไม่ได้อ่าน (v1.19) — โชว์ badge ที่เมนู "ความคิดเห็นและข้อเสนอแนะ"
const FeedbackCtx = React.createContext<number>(0);
export function useUnseenFeedback(): number {
  return React.useContext(FeedbackCtx);
}

// จำนวนรายการรอตรวจสอบของแอดมิน (v1.9) — โชว์ badge ที่เมนู "รายการรอตรวจสอบ" (admin only)
const AdminFlagsCtx = React.createContext<number>(0);
export function useAdminFlagsCount(): number {
  return React.useContext(AdminFlagsCtx);
}

// บรรทัดล่างโลโก้ = "ชื่อคน · สาขา" (แพรขอ 2026-07-27) — เดิมขึ้นแค่ตำแหน่ง ซึ่งพนักงานไม่ได้อยากรู้
// พนักงานอยากเห็นว่า "ฉันล็อกอินเป็นใคร สาขาไหน" มากกว่า โดยเฉพาะตอนใช้เครื่องร่วมกัน
const scopeLabel = (me: Me | null): string =>
  !me ? ""
    : me.workUnit === "production" ? `${me.name} · ฝ่ายผลิต`
    : me.branchScope === "all" ? `${me.name} · ทุกสาขา`
    // สาขาที่ขายควบ 2 แบรนด์ (KCN/NCD) เขียนให้ชัดว่ากะนี้ดูแลทั้ง YC และ Staple
    : isDualBrandBranch(me.branchScope)
      ? `${me.name} · สาขา ${me.branchScope} · ${branchBrandLabel(me.branchScope)}`
      : `${me.name} · สาขา ${me.branchScope}`;

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
  const [unseenFeedback, setUnseenFeedback] = React.useState(0);
  const path = usePathname();
  const router = useRouter();
  React.useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => setMe(d.user))
      .catch(() => setMe(null));
  }, [path]);

  // ชื่อแท็บเบราว์เซอร์เปลี่ยนตามหน่วยงาน (v1.25) — คนที่ปักไอคอนไว้หน้าจอมือถือจะได้เห็นชื่อของหน่วยตัวเอง
  // ตั้งที่ฝั่ง client เพราะ metadata ของ Next เป็นค่าคงที่ต่อ route ไม่รู้ว่าใครล็อกอิน
  React.useEffect(() => {
    if (me) document.title = unitBrand(me.workUnit).docTitle;
  }, [me]);

  // ยังไม่ได้ลงทะเบียนใบหน้า = พาไปทำให้จบก่อน ใช้หน้าอื่นไม่ได้ (แพรสั่ง 2026-07-28)
  // บังคับที่ฝั่งหน้าจอพอ — ตัวนี้เป็นขั้นตอนตั้งค่าเริ่มต้น ไม่ใช่ด่านความปลอดภัย
  // (ด่านจริงคือตอนลงเวลา ซึ่งเช็คที่เซิร์ฟเวอร์อยู่แล้ว) middleware อ่านฐานข้อมูลไม่ได้จึงทำตรงนั้นไม่ได้
  React.useEffect(() => {
    if (me?.mustEnrollFace && path !== "/time-clock" && path !== "/set-pin") {
      router.replace("/time-clock");
    }
  }, [me, path, router]);

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
    if (!me || me.role === "restock" || !me.features?.expiryCheck) return;
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

  // ความคิดเห็นที่ยังไม่ได้อ่าน — เคลียร์เองเมื่อแอดมินเปิดหน้านั้น (API mark seen ให้ตอน GET)
  React.useEffect(() => {
    if (me?.role !== "admin") return;
    fetch("/api/feedback/unseen-count")
      .then((r) => (r.ok ? r.json() : { count: 0 }))
      .then((d) => setUnseenFeedback(d.count ?? 0))
      .catch(() => {});
  }, [path, me?.role]);

  if (path === "/login") return <>{children}</>;

  return (
    <MeCtx.Provider value={me}>
      <UnseenReqCtx.Provider value={unseenReq}>
        <PendingReceiptCtx.Provider value={pendingReceipt}>
          <AdminFlagsCtx.Provider value={adminFlags}>
            <ExpiryDueCtx.Provider value={expiryDue}>
            <FeedbackCtx.Provider value={unseenFeedback}>
            <Sidebar />
            <MobileNav />
            <main className="lg:pl-64 print:pl-0">
              <div className="mx-auto w-full max-w-3xl px-4 py-5 pb-10 lg:max-w-4xl lg:px-8 lg:py-8 lg:pb-12 print:max-w-none print:p-0">
                {children}
              </div>
            </main>
            </FeedbackCtx.Provider>
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
        className={compact ? "h-9 w-auto" : "h-11 w-auto"}
      />
      <div className="leading-tight">
        {/* หัวจอเปลี่ยนตามหน่วยงาน (v1.24) — ฝ่ายผลิตไม่ได้ทำงานหน้าร้าน เห็นคำว่า "ระบบหน้าร้าน" แล้วสับสน
            v1.25: เพิ่มแถบสีประจำหน่วย (หน้าร้าน = แดง YC · ฝ่ายผลิต = ฟ้า Yogi)
            โลโก้ยังเป็น YC เหมือนเดิม เพราะยังไม่มีไฟล์โลโก้ Yogi/Staple ในระบบ */}
        <div className={`flex items-center gap-1.5 ${compact ? "text-[15px] font-semibold" : "text-base font-semibold"}`}>
          <span className={`h-3.5 w-1 shrink-0 rounded-full ${unitBrand(me?.workUnit).dotCls}`} />
          {unitBrand(me?.workUnit).headline}
        </div>
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
  const unseenFeedback = React.useContext(FeedbackCtx);
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

        <nav className="mt-3.5 flex flex-col gap-px">
          <div className="px-2.5 pb-1 text-[10.5px] font-medium uppercase tracking-wide text-brand-ink/35">ข้อมูลของฉัน</div>
          {accountMenuFor(me).map((t) => (
            <NavItem
              key={t.href} tab={t} active={isOn(t.href!)}
              badge={t.href === "/feedback" ? unseenFeedback : undefined}
            />
          ))}
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

/* ── Mobile: top bar + ลิ้นชักเมนูซ้าย (<lg) ── */
//
// เลิกใช้แถบแท็บด้านล่างแล้ว (v1.16) — พอเมนูโตเป็น 8-13 อัน ตัวหนังสือซ้อนกันจนอ่านไม่ออก
// ต่อให้เลื่อนแนวนอนได้ก็ยังหาของยาก · ย้ายมาเป็นลิ้นชักเปิดจากปุ่ม ☰ มุมซ้ายบนแทน
// ทุกอย่างอยู่ในนี้ที่เดียว: เมนูหลัก · กลุ่มประวัติ (กดกาง) · จัดการระบบ (แอดมิน) · เปลี่ยนรหัส · ออกจากระบบ
function MobileNav() {
  const me = React.useContext(MeCtx);
  const unseenReq = React.useContext(UnseenReqCtx);
  const pendingReceipt = React.useContext(PendingReceiptCtx);
  const adminFlags = React.useContext(AdminFlagsCtx);
  const expiryDue = React.useContext(ExpiryDueCtx);
  const unseenFeedback = React.useContext(FeedbackCtx);
  const path = usePathname();
  const logout = useLogout();
  const [open, setOpen] = React.useState(false);
  const tabs = tabsForMe(me);

  // ปิดลิ้นชักเองเมื่อเปลี่ยนหน้า · ล็อกไม่ให้หน้าข้างหลังเลื่อนตอนลิ้นชักเปิด
  React.useEffect(() => { setOpen(false); }, [path]);
  React.useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const isOn = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const tabBadge = (href?: string) =>
    href === "/requisitions" ? unseenReq
      : href === "/confirm-receipt" ? pendingReceipt
      : href === "/expiry" ? expiryDue
      : undefined;

  // รวมจำนวนที่ค้างทั้งหมดมาแปะที่ปุ่ม ☰ — ไม่งั้นเมนูปิดอยู่แล้วไม่มีอะไรบอกว่ามีงานค้าง
  const totalBadge =
    unseenReq + pendingReceipt + expiryDue + (me?.role === "admin" ? adminFlags + unseenFeedback : 0);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-white/50 bg-white/55 backdrop-blur-xl lg:hidden print:hidden">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <button
          onClick={() => setOpen(true)}
          aria-label="เปิดเมนู"
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/60 bg-white/60"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          {totalBadge > 0 && (
            <span className="absolute -right-1 -top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-brand-red px-0.5 text-[9px] font-bold text-white">
              {totalBadge > 9 ? "9+" : totalBadge}
            </span>
          )}
        </button>
        <Brand me={me} compact />
      </div>
      </header>

      {/* ลิ้นชักต้องอยู่ "นอก" header — header มี backdrop-blur ซึ่งสร้าง containing block ใหม่
          ทำให้ position:fixed ข้างในไปยึดกับกรอบ header (สูงแค่ 60px) แทนที่จะเต็มจอ */}
      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/25" onClick={() => setOpen(false)} />
          <aside className="fixed inset-y-0 left-0 z-50 flex w-[80vw] max-w-[300px] flex-col border-r border-white/60 bg-white/95 backdrop-blur-xl">
            <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3.5">
              <Brand me={me} compact />
              <button
                onClick={() => setOpen(false)}
                aria-label="ปิดเมนู"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-brand-ink/50"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
              <nav className="flex flex-col gap-px">
                {tabs.map((t) =>
                  t.children
                    ? <NavGroup key={t.label} tab={t} isOn={isOn} onNavigate={() => setOpen(false)} />
                    : <NavItem key={t.href} tab={t} active={isOn(t.href!)} badge={tabBadge(t.href)} onClick={() => setOpen(false)} />
                )}
              </nav>

              {me?.role === "admin" && (
                <nav className="mt-3.5 flex flex-col gap-px">
                  <div className="px-2.5 pb-1 text-[10.5px] font-medium uppercase tracking-wide text-brand-ink/35">จัดการระบบ</div>
                  {ADMIN_MENU.map((t) => (
                    <NavItem
                      key={t.href} tab={t} active={isOn(t.href!)}
                      badge={t.href === "/admin-flags" ? adminFlags : undefined}
                      onClick={() => setOpen(false)}
                    />
                  ))}
                </nav>
              )}

              <nav className="mt-3.5 flex flex-col gap-px">
                <div className="px-2.5 pb-1 text-[10.5px] font-medium uppercase tracking-wide text-brand-ink/35">ข้อมูลของฉัน</div>
                {accountMenuFor(me).map((t) => (
                  <NavItem
                    key={t.href} tab={t} active={isOn(t.href!)}
                    badge={t.href === "/feedback" ? unseenFeedback : undefined}
                    onClick={() => setOpen(false)}
                  />
                ))}
              </nav>
            </div>

            <button
              onClick={logout}
              className="m-3 mt-0 flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-[9px] text-[13px] font-medium text-warn transition hover:bg-warn/10"
            >
              <Icon name="logout" />
              <span>ออกจากระบบ</span>
            </button>
          </aside>
        </>
      )}
    </>
  );
}
