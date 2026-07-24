"use client";
// M2 · Restock — 2 โหมดสลับด้วย toggle บนสุด
//  A) "ต้องเติมรายสาขา": date picker จริงแทนปุ่มพุธ/เสาร์เดิม + จัดกลุ่มตาม category + เลือกรายการ (compact)
//     + จำนวนสั่งแก้ได้อิสระ + export CSV — การเลือกของแต่ละ (สาขา,วันที่) persist ลง DB (v1.4)
//  B) "สั่งผลิต (รวมทุกสาขา)": ดึงค่าล่าสุดที่บันทึกไว้ในโหมด A จาก DB มา pre-fill อัตโนมัติ (ยังแก้เองได้อิสระ)
//     + 2 วันที่ (สั่งผลิต/จัดส่ง) + รายการพิเศษ (ชื่อ/จำนวน/หน่วย/หมายเหตุ) + export CSV
// business logic เดิม (fetch /api/restock, specialActive, specialDayLabel, isSpecialActive) คงไว้เป๊ะ
// v1.4: เลิกใช้ RestockStore (client memory ข้ามโหมดในแท็บเดียว) → เปลี่ยนไปเชื่อมผ่าน DB (restock_selections)
//       เพราะคนละสาขา/อุปกรณ์/เวลากันได้ — ดู supabase/migrations/0017_restock_selections.sql + spec restock-phase1-spec.md
import React from "react";
import { GlassCard, Segmented, BranchPicker, Badge, Button, SaveBar, PageTitle, Accordion } from "@/components/ui";
import { useMe } from "@/components/nav";
import type {
  Branch, Weekday, RestockRow, RestockSelectionEntry, Meta, Item,
  ProdBranchKey, ProductionOrderItemInput, ProductionOrderSummary,
  // alias กัน ProductionOrder/ProductionOrderItem (type) ชนชื่อกับ component ProductionOrder เดิมในไฟล์นี้ — ดู spec ข้อ 8
  ProductionOrder as ProductionOrderRecord, ProductionOrderItem as ProductionOrderItemRecord,
} from "@/lib/types";
import { BRANCH_LABEL_TH, BRANCHES } from "@/lib/types";
import { specialDayLabel, weekdayFromDate, isSpecialActive } from "@/lib/calc";
import { todayISO } from "@/lib/fmt";

const WEEKDAY_LABEL_TH: Record<Weekday, string> = {
  sun: "อาทิตย์", mon: "จันทร์", tue: "อังคาร", wed: "พุธ", thu: "พฤหัสบดี", fri: "ศุกร์", sat: "เสาร์",
};

type Mode = "byBranch" | "production" | "productionHistory";
const MODE_OPTS = [
  { value: "byBranch" as Mode, label: "📦 ต้องเติมรายสาขา" },
  { value: "production" as Mode, label: "🏭 สั่งผลิต" },
  { value: "productionHistory" as Mode, label: "🗂️ ประวัติสั่งผลิต" },
];

// ── โหมด B: รายชื่อไอเทม "สั่งผลิต" hardcode (ยืนยันแล้วว่าไม่ต้องการ config ต่อไอเทมใน Settings) ──
const PRODUCTION_ITEMS_MAIN = [
  "Greek Yogurt 1kg", "Biscoff", "Plain Yogurt (ธรรมชาติ)",
  "Greek Yogurt 500g", "Plain Yogurt 500g",
  "น้ำ Ice cream / Soft Serve",
  "ถุงสตรอเบอรี่", "ถุงบลูเบอรี่", "ถุงธรรมชาติ", "ถุงลิ้นจี่", "ถุงยูส", "ถุงพีช",
  "Cornflakes Malt (M)", "Granola (M)",
];
const PRODUCTION_ITEMS_DEPT2 = [
  "Overnight oats biscoff", "พิสตาชิโอ้เครป", "พิสตาชิโอ้บัตเตอร์", "พิสตาชิโอ้ท๊อปปิ้ง",
  "ซอส Chocolate", "Choc Chip Cookies", "Cranberry Cookies",
];
const PRODUCTION_ITEM_NAMES = new Set([...PRODUCTION_ITEMS_MAIN, ...PRODUCTION_ITEMS_DEPT2]);
// ไอเทมใหม่ล่าสุด (badge เล็กๆ กำกับ — ไม่บังคับ)
const NEW_ITEM_NAMES = ["Cranberry Cookies"];

// ── ลำดับหมวดคงที่ในใบพิมพ์ 2 คอลัมน์ (แพรกำหนดตายตัวให้คนจัดของ ไม่ auto-balance ตามจำนวนอีกต่อไป) ──
// ACAI/Shake แข็ง (2 หมวด special ที่เหลือ) ยืนยันให้อยู่คอลัมซ้าย ต่อท้าย Smoothies (Pre-packed)
// "Yogurt Shake" เปลี่ยนชื่อเป็น "Yogurt Shake Toppings" 2026-07-21 + ย้ายไปคอลัมขวาต่อจาก Toppings (แพรยืนยัน)
const PRINT_LEFT_CATEGORIES = [
  "Yogurt 1kg/Box", "Yogurt 500g/Box", "Soft Serve / Ice Cream", "Drink / แยมกระปุก",
  "Cereals", "Sauces", "Fruits", "Smoothies (Pre-packed)",
  "ACAI", "Shake แข็ง",
];
const PRINT_RIGHT_CATEGORIES = [
  "Toppings", "Yogurt Shake Toppings", "Softserve Toppings", "CUP/ถ้วย", "TOPPING CUP", "LID/ฝา",
  "SPOON/ช้อน", "BAG/ถุง", "STICKER", "ของใช้", "น้ำยาทำความสะอาด", "Yogurt Smoothies Powder",
];

// ── ไอคอนผลไม้/ถ้วย — ช่วยคนจัดของที่อ่านภาษาไทยไม่ออกจำรายการจากรูปแทน ──
// v2 (2026-07-21): เปลี่ยนจาก SVG วาดเองมาใช้ emoji จริงแทน — ของเดิมแพรบอกว่าดูไม่รู้เรื่องเลย
// emoji มีรายละเอียด/รูปทรงที่คนคุ้นตากว่าเยอะ แม้พิมพ์ขาวดำก็ยังพอเห็นรูปทรงจากโทนสีเทาได้
// ลิ้นจี่ไม่มี emoji ตรงตัวในระบบ Unicode เลย ใช้ 🍈 (แตงโม/เมล่อน ทรงกลมใกล้เคียงที่สุด) แทนไปก่อน
const FRUIT_ICONS: Record<string, string> = {
  strawberry: "🍓",
  blueberry: "🫐",
  apple: "🍎",
  peach: "🍑",
  citrus: "🍋", // ยูสไม่มี emoji เฉพาะ ใช้เลมอน (ผลไม้ตระกูลส้มใกล้เคียงที่สุด) แทน
  lychee: "🍈", // ไม่มี emoji ลิ้นจี่ตรงตัว — ใช้ทรงกลมใกล้เคียงที่สุดแทน
  banana: "🍌",
  bowl: "🥣",
};
// จับคู่ชื่อรายการ → ไอคอน (เฉพาะที่มีผลไม้/รสชาติชัดเจนพอจะสื่อสารด้วยรูปได้ — Peanut Butter/Water/ถุงธรรมชาติ ไม่ใส่ เพราะไม่มีรูปที่สื่อความหมายตรง)
const ITEM_ICON_KEY: Record<string, keyof typeof FRUIT_ICONS> = {
  "ถุงสตรอเบอรี่": "strawberry", "Strawberry (250g)": "strawberry", "Strawberry (500g)": "strawberry",
  "ถุงบลูเบอรี่": "blueberry", "Blueberry (125g)": "blueberry", "Blueberry (300g)": "blueberry", "Blueberry (500g)": "blueberry",
  "ถุงลิ้นจี่": "lychee",
  "ถุงยูส": "citrus",
  "ถุงพีช": "peach",
  "Apple Cinnamon": "apple",
  "Banana": "banana",
  "Shake (แช่แข็ง)": "bowl",
};
function itemIcon(name: string): React.ReactNode | null {
  const key = ITEM_ICON_KEY[name];
  if (!key) return null;
  return <span className="text-[11px] leading-none">{FRUIT_ICONS[key]}</span>;
}

// ── CSV helpers (ใช้ร่วมทั้ง 2 โหมด) ──
function csvEscape(s: string): string {
  const str = String(s ?? "");
  const needsQuote = str.indexOf(",") >= 0 || str.indexOf('"') >= 0 || str.indexOf("\n") >= 0;
  if (!needsQuote) return str;
  return '"' + str.split('"').join('""') + '"';
}
// รวมแพ็ค+เศษเป็นข้อความเดียว ใช้ทั้งใบพิมพ์/CSV/หน้าสั่งผลิต — ไม่โชว์ "0 แพ็ค" ให้รกถ้ามีแต่เศษ
function formatOrderQty(pack: number, g: number, hasG: boolean, gUnit: string): string {
  if (!hasG) return String(pack);
  if (pack > 0 && g > 0) return `${pack} แพ็ค + ${g}${gUnit}`;
  if (pack > 0) return `${pack} แพ็ค`;
  if (g > 0) return `${g}${gUnit}`;
  return "0";
}
// ท้ายเอกสาร export ทั้ง 2 หน้า (เติมของ + สั่งผลิต) — ช่องเซ็นชื่อยืนยันรับ-ส่งของจริง
const SIGNATURE_FOOTER_LINES = [
  "",
  "ผู้จัดสินค้า,____________________,วันที่,____________________",
  "ผู้รับสินค้า,____________________,วันที่,____________________",
];

function downloadCsv(content: string, filename: string) {
  // ใส่ BOM กันตัวอักษรไทยเพี้ยนตอนเปิดด้วย Excel
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// บันทึก audit log แบบ fire-and-forget — ไม่ block การ export/print จริง ไม่ต้องรอผล
function logExport(action: string, branch: string, date: string, detail: string) {
  fetch("/api/export-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, branch, date, detail }),
  }).catch(() => {});
}

function thaiDateSlash(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

// เวลานาฬิกาแบบสั้น ใช้โชว์ข้าง "บันทึกล่าสุด" — ไม่มี helper กลางในระบบสำหรับ HH:mm เลยทำ local ที่นี่
function formatTime(d: Date): string {
  return d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
}

// ── ข้อ 3: บังคับยืนยันสาขา/วันที่ก่อนเห็นรายการ — client-side + localStorage เท่านั้น (per-device แม่นพอ) ──
// เก็บ "แต่ละ pair ที่เคยยืนยันแล้ว" แยกคีย์กัน (ไม่ใช่ค่าเดียวทับกัน) — admin สลับ SND→NVP→KCN→กลับ SND ต้องไม่โดน gate ซ้ำ
// เปลี่ยน branch/date/orderDate/deliveryDate ไปเป็น pair ที่ไม่เคยยืนยัน → gate ใหม่ตามปกติ
function useConfirmGate(storageKeyPrefix: string, pairKey: string) {
  const storageKey = `${storageKeyPrefix}:${pairKey}`;
  const [confirmed, setConfirmed] = React.useState(false);
  React.useEffect(() => {
    setConfirmed(localStorage.getItem(storageKey) === "1");
  }, [storageKey]);
  function confirm() {
    localStorage.setItem(storageKey, "1");
    setConfirmed(true);
  }
  return { confirmed, confirm };
}

// ── local component: Accordion หัวข้อมี checkbox "เลือกทั้งหมดในหมวดนี้" (indeterminate ได้) ──
// เขียนแยกจาก ui kit เพราะต้องมี element ที่คลิกแยกจากปุ่ม toggle เปิด/ปิด (กัน checkbox ซ้อนใน <button>)
function SelectableAccordion({
  title, total, selectedCount, defaultOpen, onToggleAll, children,
}: {
  title: string; total: number; selectedCount: number; defaultOpen?: boolean;
  onToggleAll: () => void; children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  const checkboxRef = React.useRef<HTMLInputElement>(null);
  const indeterminate = selectedCount > 0 && selectedCount < total;
  React.useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <div className="glass-soft mb-2 overflow-hidden">
      <div className="flex w-full items-center gap-2 px-3 py-2">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={total > 0 && selectedCount === total}
          onChange={onToggleAll}
          className="h-4 w-4 flex-shrink-0 rounded border-black/20"
          aria-label={`เลือกทั้งหมดในหมวด ${title}`}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center justify-between gap-2 text-left text-[14px] font-medium"
        >
          <span>{title}</span>
          <span className="flex items-center gap-2 text-xs text-brand-ink/50">
            <span className="rounded-full bg-black/5 px-1.5 py-0.5 font-semibold text-brand-ink/60">
              {selectedCount}/{total}
            </span>
            <span className={`transition ${open ? "rotate-180" : ""}`}>▾</span>
          </span>
        </button>
      </div>
      {open && <div className="border-t border-black/5 px-1.5 py-1">{children}</div>}
    </div>
  );
}

// ── ใบส่งของพิมพ์ A4 (แยกจาก CSV) — พนักงานหน้าร้านติ๊ก ☐ รับของจริง + เซ็นชื่อ ก่อนเอาตัวเลขไปกรอกหน้าสต็อก ──
// คอลัมน์ตายตัวตามลำดับที่แพรกำหนด (PRINT_LEFT_CATEGORIES/PRINT_RIGHT_CATEGORIES) — ไม่ auto-balance ตามจำนวนแล้ว
// v2 (2026-07-21): หมวด/รายการที่ไม่มีของจริง ไม่ส่งมาให้ component นี้เลย (กรองไว้ตั้งแต่ printGroups ฝั่งเรียกใช้)
// เพราะโชว์ครบทุกหมวดทำให้ปริ้นยาวเป็น 2 หน้า อ่านยากกว่าเดิม
type PrintRow = RestockRow & { qty: string };
const PRINT_OVERFLOW_THRESHOLD = 70; // รายการเกินนี้อาจล้นหน้า A4 — เตือนก่อนพิมพ์

function PrintSheet({
  branch, date, weekdayLabel, printGroups, totalCount, note,
}: {
  branch: Branch; date: string; weekdayLabel: string;
  printGroups: { category: string; items: PrintRow[] }[]; totalCount: number; note?: string;
}) {
  const byCategory = new Map(printGroups.map((g) => [g.category, g]));
  const col1 = PRINT_LEFT_CATEGORIES.map((c) => byCategory.get(c)).filter((g): g is (typeof printGroups)[number] => !!g);
  const col2 = PRINT_RIGHT_CATEGORIES.map((c) => byCategory.get(c)).filter((g): g is (typeof printGroups)[number] => !!g);

  function renderColumn(colGroups: typeof printGroups, withExtra: boolean) {
    return (
      <div className="flex-1">
        <table className="w-full border-collapse text-[9.5px]">
          <thead>
            <tr className="border-b-2 border-black">
              <th className="w-3 py-1"></th>
              <th className="py-1 text-left text-[8px] uppercase tracking-wide text-neutral-500">รายการ</th>
              <th className="w-7 py-1 text-center text-[8px] uppercase tracking-wide text-neutral-500">จำนวน</th>
              <th className="w-12 py-1 text-center text-[8px] uppercase tracking-wide text-neutral-500">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {colGroups.map((g) => (
              <React.Fragment key={g.category}>
                <tr>
                  <td colSpan={4} className="pt-2 text-[8.5px] font-bold uppercase tracking-wide text-neutral-600">
                    {g.category}
                  </td>
                </tr>
                {g.items.map((r) => (
                  <tr key={r.itemId} className="border-b border-neutral-300">
                    <td className="py-[3px]"><span className="inline-block h-[10px] w-[10px] border-[1.3px] border-black" /></td>
                    <td className="py-[3px] text-black">
                      <span className="inline-flex items-center gap-1">
                        {itemIcon(r.name)}
                        <span>{r.name}</span>
                      </span>
                    </td>
                    <td className="py-[3px] text-center font-bold text-black">{r.qty}</td>
                    <td className="border-b border-neutral-400 py-[3px]" />
                  </tr>
                ))}
              </React.Fragment>
            ))}
          </tbody>
        </table>
        {withExtra && (
          <div className="mt-3">
            <div className="mb-1 text-[7.5px] font-bold uppercase tracking-wide text-neutral-500">รายการอื่นๆ (เขียนเพิ่มเอง)</div>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="mb-1 h-[13px] border-b border-dotted border-neutral-400" />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="print-sheet hidden print:block">
      <style>{"@page { size: A4; margin: 10mm; }"}</style>
      <div className="mb-2.5 flex items-end justify-between border-b-[3px] border-black pb-2.5">
        <div>
          <div className="text-[19px] font-semibold leading-none text-black">ใบส่งของเข้าสาขา · Yogurt Culture</div>
          <div className="text-[32px] font-bold leading-none text-black">{branch}</div>
          <div className="mt-0.5 text-[15px] font-medium text-neutral-700">{BRANCH_LABEL_TH[branch]}</div>
        </div>
        <div className="text-right">
          <div className="text-[19px] font-semibold leading-none text-black">{thaiDateSlash(date)}</div>
          <div className="text-[11px] text-neutral-600">{weekdayLabel}</div>
        </div>
      </div>
      {note && note.trim() && (
        <div className="mb-2 border-[1.3px] border-black px-2 py-1.5">
          <span className="text-[9.5px] font-bold uppercase tracking-wide text-black">NOTE: </span>
          <span className="text-[10px] font-bold text-black">{note}</span>
        </div>
      )}

      <div className="mb-2 flex justify-between text-[9.5px] text-neutral-600">
        <span>รวม {totalCount} รายการ</span>
        <span>ผู้จัดเตรียม: ____________________</span>
      </div>

      <div className="flex gap-3.5">
        {renderColumn(col1, false)}
        {renderColumn(col2, true)}
      </div>

      <div className="mt-3 flex gap-6 border-t-[1.3px] border-black pt-2.5">
        <div className="flex-1">
          <div className="mb-4 text-[8.5px] text-neutral-600">ผู้จัดสินค้า (ผู้ส่ง)</div>
          <div className="mb-1 border-b border-black" />
          <div className="flex justify-between text-[8px] text-neutral-600">
            <span>ลายเซ็น</span><span>วันที่ ____/____/____</span>
          </div>
        </div>
        <div className="flex-1">
          <div className="mb-4 text-[8.5px] text-neutral-600">ผู้รับสินค้า (สาขา)</div>
          <div className="mb-1 border-b border-black" />
          <div className="flex justify-between text-[8px] text-neutral-600">
            <span>ลายเซ็น</span><span>วันที่ ____/____/____</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RestockPage() {
  const [mode, setMode] = React.useState<Mode>("byBranch");
  // ใบที่กำลังแก้ย้อนหลัง (ตั้งจากปุ่ม "แก้ไขใบนี้" ในหน้าประวัติเท่านั้น) — สลับแท็บมือ (Segmented) ล้างค่านี้เสมอ
  // กันเคส: เคยแก้ใบเก่าค้างไว้ แล้วสลับไปแท็บอื่นแล้วกลับมา "สั่งผลิต" มือ คาดหวังใบใหม่ ไม่ใช่ใบเดิมที่เพิ่งแก้
  const [editOrderId, setEditOrderId] = React.useState<number | null>(null);

  function changeMode(next: Mode) {
    setEditOrderId(null);
    setMode(next);
  }
  function openOrderForEdit(id: number) {
    setEditOrderId(id);
    setMode("production");
  }

  const title = mode === "byBranch" ? "รายการสินค้าเข้า" : mode === "production" ? "สั่งผลิต" : "ประวัติสั่งผลิต";

  return (
    <div>
      <div className="print:hidden">
        <PageTitle title={title} />

        <div className="mb-3">
          <Segmented options={MODE_OPTS} value={mode} onChange={changeMode} />
        </div>
      </div>

      {mode === "byBranch" ? (
        <RestockByBranch />
      ) : mode === "production" ? (
        <ProductionOrder editOrderId={editOrderId} onSaved={(id) => setEditOrderId(id)} />
      ) : (
        <ProductionHistory onEdit={openOrderForEdit} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// โหมด A — ต้องเติมรายสาขา
// ══════════════════════════════════════════════════════════════════════
function RestockByBranch() {
  const me = useMe();
  const scoped = !!me && me.branchScope !== "all";
  const [branch, setBranch] = React.useState<Branch>("NVP");
  const [date, setDate] = React.useState<string>(todayISO());

  React.useEffect(() => {
    if (scoped) setBranch(me!.branchScope as Branch);
  }, [scoped, me]);

  const [rows, setRows] = React.useState<RestockRow[]>([]);
  const [specialActive, setSpecialActive] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  // โน้ตถึงพนักงาน ต่อ (สาขา,วันที่) — พิมพ์ลงในใบส่งของ + บันทึกลง DB พร้อมตอนกด "บันทึกตัวเลือก" กลับมาเปิดคู่เดิมต้องเจอ
  const [printNote, setPrintNote] = React.useState("");

  // ── ตัวเลือกที่เลือกไว้ — hydrate จาก DB (ไม่ใช่ store client memory เดิม) ──
  const [selEntries, setSelEntries] = React.useState<Record<string, RestockSelectionEntry>>({});
  const [saving, setSaving] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  // ── snapshot ค่าที่ "บันทึกลง DB แล้วจริง" ล่าสุด (จากการโหลด หรือหลังกดบันทึกสำเร็จ) — undefined ต่อ itemId = ไม่เคยบันทึกคู่นี้เลย
  // ใช้เทียบกับ selEntries เพื่อบอกสถานะแต่ละแถว: แนะนำ (ยังไม่แตะ) / แก้ไขแล้วยังไม่บันทึก / บันทึกแล้ว
  const [savedEntries, setSavedEntries] = React.useState<Record<string, { selected: boolean; qty: number; qtyG: number }>>({});

  const weekday = React.useMemo(() => weekdayFromDate(date), [date]);

  // ── ข้อ 3: gate ยืนยันสาขา+วันที่ก่อนเห็นรายการ ──
  const pairKey = `${branch}|${date}`;
  const { confirmed, confirm } = useConfirmGate("yc:restock:gate:byBranch", pairKey);

  React.useEffect(() => {
    if (!confirmed) return; // กันยิง API เปล่าๆ ตอนผู้ใช้ยังเปลี่ยนวันที่ไปมาไม่นิ่ง
    let alive = true;
    setLoading(true);
    setError(null);
    setLastSavedAt(null); // สลับ (สาขา,วันที่) ใหม่ — เวลาบันทึกล่าสุดของคู่เก่าไม่เกี่ยวแล้ว
    Promise.all([
      fetch(`/api/restock?branch=${branch}&day=${weekday}`).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "โหลดข้อมูลไม่สำเร็จ");
        return data as { rows: RestockRow[]; specialActive: boolean };
      }),
      fetch(`/api/restock/selections?branch=${branch}&date=${date}`).then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "โหลดตัวเลือกที่บันทึกไว้ไม่สำเร็จ");
        return data as { entries: Record<string, { selected: boolean; qty: number; qtyG: number }>; note?: string };
      }),
    ])
      .then(([restockData, selData]) => {
        if (!alive) return;
        setRows(restockData.rows);
        setSpecialActive(restockData.specialActive);
        setPrintNote(selData.note ?? "");
        // ถ้าเคย save (branch,date) นี้ไว้แล้ว → ใช้ค่าจาก DB ตรงๆ (ไม่ reset กลับ default)
        // ถ้าไม่เคย (หรือเป็นไอเทมใหม่ที่เพิ่มเข้าระบบทีหลัง) → fallback ไป default เดิม (selected = need>0, qty = need, qtyG = 0)
        const next: Record<string, RestockSelectionEntry> = {};
        for (const r of restockData.rows) {
          const saved = selData.entries[r.itemId];
          next[r.itemId] = saved
            ? { itemId: r.itemId, selected: saved.selected, qty: saved.qty, qtyG: saved.qtyG }
            : { itemId: r.itemId, selected: r.need != null && r.need > 0, qty: r.need ?? 0, qtyG: 0 };
        }
        setSelEntries(next);
        setSavedEntries(selData.entries); // snapshot ของจริงจาก DB ณ ตอนโหลด — ใช้เทียบสถานะแต่ละแถว
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
        setRows([]);
        setSpecialActive(false);
        setSelEntries({});
        setSavedEntries({});
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branch, weekday, date, confirmed]);

  const dayLabel = "วัน" + WEEKDAY_LABEL_TH[weekday];
  const ownSpecialDay = specialDayLabel(branch); // string | null — null = สาขานี้ยังไม่มีรอบ special

  function updateEntry(itemId: string, patch: Partial<RestockSelectionEntry>) {
    setSelEntries((prev) => {
      const cur = prev[itemId] ?? { itemId, selected: false, qty: 0, qtyG: 0 };
      return { ...prev, [itemId]: { ...cur, ...patch } };
    });
  }
  function toggleItem(itemId: string) {
    updateEntry(itemId, { selected: !selEntries[itemId]?.selected });
  }
  function toggleCategoryAll(items: RestockRow[]) {
    const allSel = items.length > 0 && items.every((r) => selEntries[r.itemId]?.selected);
    setSelEntries((prev) => {
      const next = { ...prev };
      for (const r of items) {
        const cur = next[r.itemId] ?? { itemId: r.itemId, selected: false, qty: 0, qtyG: 0 };
        next[r.itemId] = { ...cur, selected: !allSel };
      }
      return next;
    });
  }
  function toggleAllGlobal() {
    toggleCategoryAll(regularRows);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const entries = rows.map((r) => ({
        itemId: r.itemId,
        selected: selEntries[r.itemId]?.selected ?? false,
        qty: Number(selEntries[r.itemId]?.qty ?? 0),
        qtyG: Number(selEntries[r.itemId]?.qtyG ?? 0),
      }));
      const res = await fetch("/api/restock/selections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, date, entries, note: printNote }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      setLastSavedAt(new Date());
      // อัปเดต snapshot "บันทึกแล้ว" ทันที — ทุกแถวที่เพิ่ง POST ไปกลายเป็นสีเขียวพร้อมกัน ไม่ต้องรอโหลดใหม่
      const nextSaved: Record<string, { selected: boolean; qty: number; qtyG: number }> = {};
      for (const e of entries) nextSaved[e.itemId] = { selected: e.selected, qty: e.qty, qtyG: e.qtyG };
      setSavedEntries(nextSaved);
    } catch (e: any) {
      window.alert(`บันทึกไม่สำเร็จ: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  // ค่าที่ระบบเดาให้ตอนยังไม่เคยมีใครกรอก (Par − คงเหลือ) — ใช้เทียบว่าแถวนี้ "ยังไม่ถูกแตะเลย" หรือเปล่า
  // qtyG ไม่มี default ให้เดา (เป็นเคสพิเศษที่ผลผลิตไม่เต็มแพ็ค) เริ่มที่ 0 เสมอ
  function defaultOf(r: RestockRow): { selected: boolean; qty: number; qtyG: number } {
    return { selected: r.need != null && r.need > 0, qty: r.need ?? 0, qtyG: 0 };
  }
  // สถานะต่อแถว: บันทึกแล้ว (ตรงกับ DB) / แก้ไขแล้วยังไม่บันทึก / แนะนำ (ยังไม่แตะ ไม่เคยบันทึกคู่นี้เลย)
  function statusOf(r: RestockRow): "saved" | "dirty" | "suggested" {
    const cur = selEntries[r.itemId] ?? { itemId: r.itemId, selected: false, qty: 0, qtyG: 0 };
    const saved = savedEntries[r.itemId];
    if (saved && cur.selected === saved.selected && cur.qty === saved.qty && cur.qtyG === saved.qtyG) return "saved";
    if (!saved) {
      const def = defaultOf(r);
      if (cur.selected === def.selected && cur.qty === def.qty && cur.qtyG === def.qtyG) return "suggested";
    }
    return "dirty";
  }
  // class สี/ทรงช่องกรอกตามสถานะ — ใช้ร่วมกันทั้งช่องแพ็คและช่องกรัม (ข้อ pack+g)
  function qtyFieldClass(isSel: boolean, status: "saved" | "dirty" | "suggested"): string {
    if (!isSel) return "opacity-40";
    if (status === "saved") return "font-semibold border-ok/50 bg-ok/10 text-ok";
    if (status === "dirty") return "font-semibold border-brand-blue bg-brand-blue/15";
    return "border-dashed border-black/25 text-brand-ink/45 italic";
  }

  // จัดกลุ่มตาม category (คงลำดับตามที่ backend ส่งมา)
  // ข้อ special-ฉุกเฉิน: รายการ special ที่ไม่ถึงรอบวันนี้ (isSpecial && !specialActive) ไม่ปนกับหมวดปกติ
  // แยกไปโชว์ในส่วน "สั่งฉุกเฉินนอกรอบ" ต่างหาก (ดู emergencySpecialItems ข้างล่าง) — ถ้าเป็นวันที่ถึงรอบจริง (specialActive)
  // ยังปนอยู่ในหมวดปกติเหมือนเดิม ไม่เปลี่ยนพฤติกรรม
  const groups = React.useMemo(() => {
    const out: { category: string; items: RestockRow[] }[] = [];
    for (const r of rows) {
      if (r.isSpecial && !specialActive) continue;
      let g = out.find((x) => x.category === r.category);
      if (!g) { g = { category: r.category, items: [] }; out.push(g); }
      g.items.push(r);
    }
    return out;
  }, [rows, specialActive]);

  const emergencySpecialItems = React.useMemo(
    () => rows.filter((r) => r.isSpecial && !specialActive),
    [rows, specialActive]
  );
  // รายการปกติล้วน (ไม่รวมส่วนฉุกเฉิน) — ใช้กับตัวนับ/เลือกทั้งหมดที่หัวหน้า กันปุ่ม "เลือกทั้งหมด" ไปติ๊กของฉุกเฉินโดยไม่ตั้งใจ
  const regularRows = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // แถวเดียว (checkbox + par/คงเหลือ + ช่องจำนวน) ใช้ร่วมกันทั้งหมวดปกติและส่วนสั่งฉุกเฉิน
  function renderItemRow(r: RestockRow) {
    const entry = selEntries[r.itemId];
    const isSel = !!entry?.selected;
    const inProduction = PRODUCTION_ITEM_NAMES.has(r.name);
    const status = statusOf(r);
    return (
      <div
        key={r.itemId}
        className={`mb-0.5 flex min-h-[26px] items-center gap-1.5 rounded-md border-l-[2.5px] px-1.5 py-1 ${
          isSel ? "border-l-ok bg-ok/10" : "border-l-transparent bg-black/[.02] opacity-50"
        }`}
      >
        <input
          type="checkbox"
          checked={isSel}
          onChange={() => toggleItem(r.itemId)}
          className="h-3.5 w-3.5 flex-shrink-0 rounded border-black/20"
        />
        <span className="flex min-w-0 flex-1 items-center gap-1 text-[11.5px] font-medium">
          <span className="truncate">{r.name}</span>
          {r.isSpecial && <Badge tone="orange">special</Badge>}
          {inProduction && <Badge tone="blue">← สั่งผลิต</Badge>}
        </span>
        <span className="w-8 shrink-0 text-right text-[10.5px] tabular-nums text-brand-ink/60">
          {r.par ?? "—"}
        </span>
        {r.remainG !== undefined ? (
          <span className="w-11 shrink-0 text-right leading-tight">
            <span className="block text-[10.5px] tabular-nums text-brand-ink/60">{r.remain} แพ็ค</span>
            <span className="block text-[9px] tabular-nums text-brand-ink/40">
              +{r.remainG}{r.isCup ? " ชิ้น" : "g"}
            </span>
          </span>
        ) : (
          <span className="w-8 shrink-0 text-right text-[10.5px] tabular-nums text-brand-ink/60">
            {r.remain}
          </span>
        )}
        {isSel && status === "dirty" && (
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn" title="แก้ไขแล้ว ยังไม่บันทึก" />
        )}
        <input
          inputMode="numeric"
          value={entry?.qty ?? ""}
          disabled={!isSel}
          onChange={(e) => updateEntry(r.itemId, { qty: Number(e.target.value) || 0 })}
          title={
            !isSel ? undefined
              : status === "saved" ? "บันทึกลง DB แล้ว"
              : status === "dirty" ? "แก้ไขแล้ว ยังไม่บันทึก"
              : "ค่าที่ระบบแนะนำ (Par − คงเหลือ) — ยังไม่ได้ยืนยัน"
          }
          className={`field w-[34px] shrink-0 px-1 py-0.5 text-center text-[11px] ${qtyFieldClass(isSel, status)}`}
        />
        {r.hasVariableYield && (
          <>
            <span className="shrink-0 text-[10px] text-brand-ink/35">+</span>
            <input
              inputMode="numeric"
              value={entry?.qtyG ?? ""}
              disabled={!isSel}
              onChange={(e) => updateEntry(r.itemId, { qtyG: Number(e.target.value) || 0 })}
              title={`เศษ${r.isCup ? " (ชิ้น)" : " (g)"} ที่ไม่เต็มแพ็ค — ผลผลิตบางรอบไม่ออกมาเต็มกล่อง กรอกเฉพาะรอบที่มีจริง`}
              placeholder={r.isCup ? "ชิ้น" : "g"}
              className={`field w-[34px] shrink-0 px-1 py-0.5 text-center text-[10px] ${qtyFieldClass(isSel, status)}`}
            />
          </>
        )}
      </div>
    );
  }

  const selectedTotal = React.useMemo(
    () => regularRows.filter((r) => selEntries[r.itemId]?.selected).length,
    [regularRows, selEntries]
  );
  const allChecked = regularRows.length > 0 && regularRows.every((r) => selEntries[r.itemId]?.selected);
  const dirtyCount = React.useMemo(
    () => rows.filter((r) => statusOf(r) === "dirty").length,
    [rows, selEntries, savedEntries]
  );

  function exportCsv() {
    const selectedRows = rows.filter((r) => selEntries[r.itemId]?.selected);
    const lines = ["หมวด,รายการ,จำนวนสั่ง (แพ็ค),เศษ"];
    for (const r of selectedRows) {
      const entry = selEntries[r.itemId];
      const q = entry?.qty ?? 0;
      const qG = r.hasVariableYield ? entry?.qtyG ?? 0 : "";
      lines.push([csvEscape(r.category), csvEscape(r.name), String(q), String(qG)].join(","));
    }
    lines.push(...SIGNATURE_FOOTER_LINES);
    downloadCsv(lines.join("\n"), `restock_${branch}_${date}.csv`);
    logExport("export_restock_csv", branch, date, `export CSV ${selectedRows.length} รายการ`);
  }

  // ── ใบส่งของพิมพ์ A4 — qty รวมแพ็ค+เศษเป็นข้อความเดียว (เช่น "1 แพ็ค + 700g") ──
  // สร้างจาก rows ทั้งหมด (รวมรายการฉุกเฉินนอกรอบด้วย ถ้าถูกเลือก) ไม่ใช่แค่ groups ปกติ
  // v2 (2026-07-21): เลิกโชว์หมวด/รายการที่ไม่มีของจริง (แพรบอกว่าทำให้ปริ้นยาวเป็น 2 หน้า อ่านยากกว่าเดิม)
  // กลับไปโชว์เฉพาะรายการที่ติ๊ก + มีจำนวนจริง >0 (ติ๊กไว้แต่ใส่ 0 ก็ไม่โชว์) และข้ามหมวดที่ไม่มีรายการเลย
  // ยังคงลำดับ 2 คอลัมน์ตายตัวไว้ (PRINT_LEFT/RIGHT_CATEGORIES) แค่ข้ามหมวดว่างไปเฉยๆ ไม่พิมพ์ "ไม่มีสินค้าเข้า" อีกต่อไป
  const printGroups = React.useMemo(() => {
    const byCategory = new Map<string, PrintRow[]>();
    for (const r of rows) {
      const entry = selEntries[r.itemId];
      if (!entry?.selected) continue;
      if ((entry.qty ?? 0) <= 0 && (entry.qtyG ?? 0) <= 0) continue;
      const qtyText = formatOrderQty(entry.qty ?? 0, entry.qtyG ?? 0, r.hasVariableYield ?? false, r.isCup ? "ชิ้น" : "g");
      const arr = byCategory.get(r.category) ?? [];
      arr.push({ ...r, qty: qtyText });
      byCategory.set(r.category, arr);
    }
    const allCats = [...PRINT_LEFT_CATEGORIES, ...PRINT_RIGHT_CATEGORIES];
    return allCats
      .map((category) => ({ category, items: byCategory.get(category) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [rows, selEntries]);
  const printTotal = React.useMemo(() => printGroups.reduce((s, g) => s + g.items.length, 0), [printGroups]);

  function printSlip() {
    if (printTotal === 0) {
      window.alert("ยังไม่ได้เลือกรายการ — เลือกรายการที่จะเติมก่อนพิมพ์");
      return;
    }
    if (printTotal > PRINT_OVERFLOW_THRESHOLD) {
      const ok = window.confirm(
        `รายการที่เลือก ${printTotal} รายการ อาจล้นหน้า A4 ใบเดียว\nต้องการพิมพ์ต่อไหม?`
      );
      if (!ok) return;
    }
    logExport("print_restock_slip", branch, date, `พิมพ์ใบส่งของ ${printTotal} รายการ`);
    window.print();
  }

  return (
    <>
    <div className="print:hidden">
      <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <BranchPicker value={branch} onChange={setBranch} locked={scoped} />
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-brand-ink/50">วันที่จัดส่งสินค้าเข้าสาขา</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} className="field" />
        </label>
      </div>
      <p className="mb-3 px-1 text-[11px] text-brand-ink/50">
        ตรงกับ{dayLabel}
        {isSpecialActive(branch, weekday) ? " — มีรอบ special ที่สาขานี้" : " — ไม่มีรอบ special วันนี้"}
      </p>

      {!confirmed ? (
        // ข้อ 3: gate inline (ไม่ใช่ modal) — กันกรอกผิดสาขา/วันที่ แต่ไม่รำคาญถ้ากลับมาที่คู่เดิมซ้ำ
        <GlassCard>
          <h2 className="mb-2 text-[15px] font-semibold">ยืนยันสาขา + วันที่ก่อนเริ่มกรอก</h2>
          <p className="mb-4 text-sm leading-relaxed text-brand-ink/60">
            กำลังจะกรอกรายการเติมของของ <b className="text-brand-ink">สาขา {branch}</b> ({BRANCH_LABEL_TH[branch]})
            <br />
            วันที่ <b className="text-brand-ink">{thaiDateSlash(date)}</b> ({dayLabel})
          </p>
          <Button onClick={confirm}>✅ ยืนยัน เริ่มกรอกรายการ</Button>
        </GlassCard>
      ) : (
        <GlassCard>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="text-[15px] font-semibold">
              รอบเติม · {dayLabel} · {branch}
            </h2>
            <span className="shrink-0 text-xs text-brand-ink/50">{regularRows.length} รายการ</span>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-brand-ink/50">กำลังโหลด…</div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-warn">{error}</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-brand-ink/50">ไม่มีรายการในรอบนี้</div>
          ) : (
            <>
              {/* global toolbar */}
              <div className="mb-2.5 flex items-center justify-between gap-2 rounded-lg bg-black/[.03] px-3 py-2">
                <label className="flex items-center gap-2 text-xs font-medium text-brand-ink/70">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAllGlobal}
                    className="h-4 w-4 rounded border-black/20"
                  />
                  เลือกทั้งหมด
                </label>
                <span className="text-xs font-semibold text-brand-ink/60">
                  {selectedTotal}/{regularRows.length} รายการที่เลือก
                </span>
              </div>

              {groups.map((g, gi) => {
                const selInCat = g.items.filter((r) => selEntries[r.itemId]?.selected).length;
                return (
                  <SelectableAccordion
                    key={g.category}
                    title={g.category}
                    total={g.items.length}
                    selectedCount={selInCat}
                    defaultOpen={gi === 0}
                    onToggleAll={() => toggleCategoryAll(g.items)}
                  >
                    <div>{g.items.map(renderItemRow)}</div>
                  </SelectableAccordion>
                );
              })}

              {emergencySpecialItems.length > 0 && (
                <div className="mt-3 rounded-xl border border-brand-orange/40 bg-brand-orange/[.06] p-2.5">
                  <p className="mb-2 px-0.5 text-[11px] leading-relaxed text-orange-700">
                    ⚠️ 7 รายการ special ไม่ถึงรอบเข้าวันนี้ ({branch} เข้าเฉพาะวัน{ownSpecialDay ?? "—"}) — ใช้ส่วนนี้เฉพาะกรณีต้องสั่งฉุกเฉินนอกรอบเท่านั้น
                  </p>
                  <SelectableAccordion
                    title="🚨 สั่งฉุกเฉิน (นอกรอบ special)"
                    total={emergencySpecialItems.length}
                    selectedCount={emergencySpecialItems.filter((r) => selEntries[r.itemId]?.selected).length}
                    onToggleAll={() => toggleCategoryAll(emergencySpecialItems)}
                  >
                    <div>{emergencySpecialItems.map(renderItemRow)}</div>
                  </SelectableAccordion>
                </div>
              )}
            </>
          )}

          {!loading && !error && rows.length > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-brand-ink/60">
              {specialActive
                ? `รอบนี้รวม 7 รายการ special (${branch} เข้า${dayLabel})`
                : ownSpecialDay
                  ? `รอบนี้ไม่มี 7 รายการ special — ${branch} รับ special เฉพาะวัน${ownSpecialDay}`
                  : `สาขา ${branch} ยังไม่เปิดรับ 7 รายการ special (รอกำหนดรอบเติมของ)`}
            </p>
          )}
        </GlassCard>
      )}

      {confirmed && !loading && !error && rows.length > 0 && (
        <>
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">โน้ตถึงพนักงาน (แสดงในใบส่งของที่พิมพ์ ไม่บังคับ — กดบันทึกตัวเลือกแล้วจะจำไว้)</span>
            <textarea
              value={printNote} onChange={(e) => setPrintNote(e.target.value)}
              rows={2} placeholder="เช่น เช็คน้ำหนักก่อนเซ็นรับ / ระวังกล่องแตก"
              className="field text-left"
            />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={exportCsv}
              className="rounded-xl bg-white/70 px-4 py-3 text-[14px] font-semibold text-brand-ink border border-black/10 active:scale-[.98]"
            >
              📤 Export (CSV)
            </button>
            <button
              type="button"
              onClick={printSlip}
              className="rounded-xl bg-brand-ink px-4 py-3 text-[14px] font-semibold text-white active:scale-[.98]"
            >
              🖨️ พิมพ์ใบส่งของ
            </button>
          </div>
          <SaveBar>
            {dirtyCount > 0 ? (
              <p className="mb-2 rounded-lg bg-warn/10 px-3 py-2 text-center text-xs font-medium text-warn">
                ⚠️ มีการแก้ไข {dirtyCount} รายการที่ยังไม่บันทึก — หน้าสั่งผลิตจะยังไม่เห็นค่านี้
              </p>
            ) : lastSavedAt ? (
              <p className="mb-2 rounded-lg bg-ok/10 px-3 py-2 text-center text-xs font-medium text-ok">
                ✓ บันทึกล่าสุด {formatTime(lastSavedAt)} น. — ไม่มีการแก้ไขค้าง
              </p>
            ) : null}
            <Button onClick={handleSave} disabled={saving || loading}>
              {saving ? "กำลังบันทึก…" : "💾 บันทึกตัวเลือก"}
            </Button>
          </SaveBar>
        </>
      )}

      <p className="mt-3 px-1 text-xs text-brand-ink/45">ต้องเติม = MAX(Par − คงเหลือ, 0) · แถบฟ้า "← สั่งผลิต" = ไอเทมนี้จะไปโผล่ในหน้าสั่งผลิตอัตโนมัติ · ใบส่งของไว้พิมพ์แนบของจริง ให้สาขาติ๊กรับ+เซ็นชื่อ</p>
      {confirmed && !loading && !error && rows.length > 0 && (
        <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-brand-ink/40">
          สีช่องจำนวน: <i className="not-italic text-brand-ink/45">เอียง+เส้นประ</i> = ค่าที่ระบบแนะนำ ยังไม่ยืนยัน ·{" "}
          <i className="not-italic text-sky-700">ฟ้า</i> = แก้ไขแล้วยังไม่บันทึก · <i className="not-italic text-ok">เขียว</i> = บันทึกลง DB แล้ว
        </p>
      )}
    </div>
    <PrintSheet branch={branch} date={date} weekdayLabel={dayLabel} printGroups={printGroups} totalCount={printTotal} note={printNote} />
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// โหมด B — สั่งผลิต (รวมทุกสาขา) — ดึง reflected จาก DB (v1.4) แทน prop store · ไม่มีปุ่มบันทึก มีแต่ export
// ══════════════════════════════════════════════════════════════════════
type ProdField = "SND" | "NVP" | "KCN" | "other";
const PROD_FIELDS: { key: ProdField; label: string }[] = [
  { key: "SND", label: "SND" },
  { key: "NVP", label: "NVP" },
  { key: "KCN", label: "KCN" },
  { key: "other", label: "อื่นๆ" },
];

interface ExtraRow { id: string; name: string; qty: string; unit: string; note: string }

function ProductionRow({
  item, par, values, gValues, onChange, onChangeG, tone, isNew, reflected,
}: {
  item: Item;
  par: Partial<Record<Branch, number | null>>;
  values: Partial<Record<ProdField, string>>;
  gValues: Partial<Record<ProdField, string>>;
  onChange: (field: ProdField, v: string) => void;
  onChangeG: (field: ProdField, v: string) => void;
  tone?: "orange";
  isNew?: boolean;
  reflected?: boolean;
}) {
  const hasG = item.variableYield; // เศษไม่เต็มแพ็ค (Yuzu ฯลฯ) — ผลผลิตบางรอบไม่ออกมาเต็มกล่อง
  const gUnit = item.isCup ? "ชิ้น" : "g";
  const packSum = PROD_FIELDS.reduce((s, f) => s + (parseFloat(values[f.key] ?? "") || 0), 0);
  const gSum = PROD_FIELDS.reduce((s, f) => s + (parseFloat(gValues[f.key] ?? "") || 0), 0);
  const totalG = hasG ? packSum * item.gramsPerUOM + gSum : 0;
  const isOrange = tone === "orange";
  return (
    <div className={`px-3 py-2.5 ${isOrange ? "rounded-xl border border-brand-orange/40 bg-brand-orange/10" : "glass-soft"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`text-sm font-medium ${isOrange ? "text-orange-700" : ""}`}>{item.name}</span>
        <div className="flex shrink-0 gap-1">
          {reflected && <Badge tone="blue">จาก Restock</Badge>}
          {isNew && <Badge tone="ok">ไอเทมใหม่</Badge>}
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {PROD_FIELDS.map((f) => {
          const parVal = f.key === "other" ? undefined : par[f.key as Branch];
          const disabled = f.key !== "other" && parVal == null;
          return (
            <label key={f.key} className="flex flex-col gap-0.5">
              <span className={`text-[8.5px] leading-tight ${isOrange ? "text-orange-700/70" : "text-brand-ink/50"}`}>
                {f.label}
              </span>
              {f.key !== "other" && (
                <span className={`text-[7.5px] leading-none ${isOrange ? "text-orange-700/50" : "text-brand-ink/35"}`}>
                  Par {parVal ?? "—"}
                </span>
              )}
              <input
                inputMode="numeric"
                value={values[f.key] ?? ""}
                disabled={disabled}
                onChange={(e) => onChange(f.key, e.target.value)}
                className={`field px-1.5 py-1 text-center text-xs ${disabled ? "opacity-40" : ""} ${
                  isOrange ? "bg-white/80" : ""
                }`}
              />
              {hasG && (
                <input
                  inputMode="numeric"
                  value={gValues[f.key] ?? ""}
                  disabled={disabled}
                  placeholder={`+${gUnit}`}
                  title={`เศษ (${gUnit}) ที่ไม่เต็มแพ็ค — กรอกเฉพาะรอบที่มีจริง`}
                  onChange={(e) => onChangeG(f.key, e.target.value)}
                  className={`field px-1.5 py-1 text-center text-[10px] ${disabled ? "opacity-40" : ""} ${
                    isOrange ? "bg-white/80" : ""
                  }`}
                />
              )}
            </label>
          );
        })}
      </div>
      <div className={`mt-2 text-right text-xs font-semibold ${isOrange ? "text-orange-700" : "text-brand-ink/70"}`}>
        {hasG
          ? `รวมสั่งผลิต: ${Math.floor(totalG / item.gramsPerUOM)} แพ็ค (${totalG.toLocaleString()}${gUnit})`
          : `รวมสั่งผลิต: ${packSum}`}
      </div>
    </div>
  );
}

// ── ใบสั่งผลิตพิมพ์ A4 — แยกจาก CSV เหมือนใบส่งของ ให้ทีมผลิตติ๊ก ☐ + เซ็นชื่อได้ ──
interface ProdPrintRow { id: string; name: string; snd: string; nvp: string; kcn: string; other: string; total: string; note: string }
const PRODUCTION_PRINT_OVERFLOW_THRESHOLD = 40;

function ProductionPrintSheet({
  orderDate, deliveryDate, printGroups, totalCount, note,
}: {
  orderDate: string; deliveryDate: string;
  printGroups: { category: string; items: ProdPrintRow[] }[]; totalCount: number; note: string;
}) {
  return (
    <div className="print-sheet hidden print:block">
      <style>{"@page { size: A4; margin: 10mm; }"}</style>
      <div className="mb-2.5 flex items-end justify-between border-b-[3px] border-black pb-2.5">
        <div>
          <div className="text-[13px] font-medium uppercase tracking-widest text-neutral-500">ใบสั่งผลิต · Yogurt Culture</div>
          <div className="text-[26px] font-bold leading-tight text-black">สั่งผลิต {thaiDateSlash(orderDate)}</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-widest text-neutral-500">จัดส่งเข้าสาขา</div>
          <div className="text-[22px] font-semibold leading-none text-black">{thaiDateSlash(deliveryDate)}</div>
        </div>
      </div>
      <div className="mb-2 flex justify-between text-[9.5px] text-neutral-600">
        <span>รวม {totalCount} รายการ</span>
        <span>ผู้สั่งผลิต: ____________________</span>
      </div>

      <table className="w-full border-collapse text-[9px]">
        <thead>
          <tr className="border-b-2 border-black">
            <th className="w-3 py-1 align-top"></th>
            <th className="py-1 align-top text-left text-[8px] uppercase tracking-wide text-neutral-500">รายการ</th>
            <th className="w-8 py-1 align-top text-center text-[8px] uppercase tracking-wide text-neutral-500">SND<br /><span className="normal-case text-neutral-700">{BRANCH_LABEL_TH.SND}</span></th>
            <th className="w-8 py-1 align-top text-center text-[8px] uppercase tracking-wide text-neutral-500">NVP<br /><span className="normal-case text-neutral-700">{BRANCH_LABEL_TH.NVP}</span></th>
            <th className="w-8 py-1 align-top text-center text-[8px] uppercase tracking-wide text-neutral-500">KCN<br /><span className="normal-case text-neutral-700">{BRANCH_LABEL_TH.KCN}</span></th>
            <th className="w-10 py-1 align-top text-center text-[8px] uppercase tracking-wide text-neutral-500">อื่นๆ</th>
            <th className="w-9 py-1 align-top text-center text-[8px] uppercase tracking-wide text-neutral-500">รวม</th>
            <th className="w-16 py-1 align-top text-center text-[8px] uppercase tracking-wide text-neutral-500">หมายเหตุ</th>
          </tr>
        </thead>
        <tbody>
          {printGroups.map((g) => (
            <React.Fragment key={g.category}>
              <tr>
                <td colSpan={8} className="pt-2 text-[7.5px] font-bold uppercase tracking-wide text-neutral-500">
                  {g.category}
                </td>
              </tr>
              {g.items.map((r) => (
                <tr key={r.id} className="border-b border-neutral-300">
                  <td className="py-[3px]"><span className="inline-block h-[10px] w-[10px] border-[1.3px] border-black" /></td>
                  <td className="py-[3px] text-black">
                    <span className="inline-flex items-center gap-1">
                      {itemIcon(r.name)}
                      <span>{r.name}</span>
                    </span>
                  </td>
                  <td className="py-[3px] text-center text-black">{r.snd}</td>
                  <td className="py-[3px] text-center text-black">{r.nvp}</td>
                  <td className="py-[3px] text-center text-black">{r.kcn}</td>
                  <td className="py-[3px] text-center text-black">{r.other}</td>
                  <td className="py-[3px] text-center font-bold text-black">{r.total}</td>
                  <td className="py-[3px] text-center text-black">{r.note}</td>
                </tr>
              ))}
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {note.trim() && (
        <div className="mt-3 text-[9px] text-black">
          <span className="font-bold">หมายเหตุรวม: </span>{note.trim()}
        </div>
      )}

      <div className="mt-3">
        <div className="mb-1 text-[7.5px] font-bold uppercase tracking-wide text-neutral-500">รายการอื่นๆ (เขียนเพิ่มเอง)</div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="mb-1 h-[13px] border-b border-dotted border-neutral-400" />
        ))}
      </div>

      <div className="mt-3 flex gap-6 border-t-[1.3px] border-black pt-2.5">
        <div className="flex-1">
          <div className="mb-4 text-[8.5px] text-neutral-600">ผู้จัดสินค้า (ผู้สั่ง)</div>
          <div className="mb-1 border-b border-black" />
          <div className="flex justify-between text-[8px] text-neutral-600">
            <span>ลายเซ็น</span><span>วันที่ ____/____/____</span>
          </div>
        </div>
        <div className="flex-1">
          <div className="mb-4 text-[8.5px] text-neutral-600">ผู้ผลิต</div>
          <div className="mb-1 border-b border-black" />
          <div className="flex justify-between text-[8px] text-neutral-600">
            <span>ลายเซ็น</span><span>วันที่ ____/____/____</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// map ระหว่าง ProdField ("other" ตัวเล็ก ใช้ในกริด UI เดิม) ↔ ProdBranchKey ("OTHER" ตัวใหญ่ ใช้ฝั่ง DB) — ต่างกันแค่ช่อง other/OTHER
function branchKeyFromProdField(f: ProdField): ProdBranchKey {
  return f === "other" ? "OTHER" : f;
}
function prodFieldFromBranchKey(bk: ProdBranchKey): ProdField {
  return bk === "OTHER" ? "other" : bk;
}
function gridKey(itemId: string, field: ProdField): string {
  return `${itemId}|${field}`;
}

function ProductionOrder({
  editOrderId, onSaved,
}: {
  editOrderId: number | null;
  onSaved: (id: number) => void;
}) {
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [metaError, setMetaError] = React.useState<string | null>(null);
  const [metaLoading, setMetaLoading] = React.useState(true);

  // ── v1.5: persist ใบสั่งผลิตลง DB — orderId ที่ยังเป็น null = draft ยังไม่บันทึก (POST ใหม่ตอนกด save)
  // savedItemIds คีย์คู่กับช่องกรอกในกริด (`itemId|field`) หรือ extraRow.id → server id ของแถวนั้น ใช้ตอน PATCH ว่าแถวไหนมีอยู่แล้ว
  const [orderId, setOrderId] = React.useState<number | null>(null);
  const [savedItemIds, setSavedItemIds] = React.useState<Record<string, number>>({});
  const [dirty, setDirty] = React.useState(false); // binary พอ (ไม่ทำ per-field status ละเอียดแบบเฟส 1 — ช่องเยอะกว่ามาก ไม่คุ้ม)
  const [saving, setSaving] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  // รายการพิเศษที่ลบทิ้งระหว่างแก้ไข (เฉพาะที่เคยมี server id แล้ว) — ส่งเป็น removedItemIds ตอน PATCH
  const [removedExtraIds, setRemovedExtraIds] = React.useState<number[]>([]);

  // ── โหมดแก้ไขใบเก่า (editOrderId != null) — โหลดใบเต็มจาก DB มา hydrate ทุกอย่างแทนค่า default ──
  const [orderLoading, setOrderLoading] = React.useState(false);
  const [orderLoadError, setOrderLoadError] = React.useState<string | null>(null);

  // ── /api/meta โหลดครั้งเดียว (ไม่ผูกวันที่) ──
  React.useEffect(() => {
    let alive = true;
    fetch("/api/meta")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error((data as any)?.error ?? "โหลด meta ไม่สำเร็จ");
        return data as Meta;
      })
      .then((m) => { if (alive) setMeta(m); })
      .catch((e) => { if (alive) setMetaError(String(e?.message ?? e)); })
      .finally(() => { if (alive) setMetaLoading(false); });
    return () => { alive = false; };
  }, []);

  const [prodQty, setProdQty] = React.useState<Record<string, Partial<Record<ProdField, string>>>>({});
  const [prodQtyG, setProdQtyG] = React.useState<Record<string, Partial<Record<ProdField, string>>>>({});
  const [extraRows, setExtraRows] = React.useState<ExtraRow[]>([]);
  const [extraName, setExtraName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [orderDate, setOrderDate] = React.useState<string>(todayISO());
  const [deliveryDate, setDeliveryDate] = React.useState<string>(todayISO());

  // ── ข้อ 3: gate ยืนยันวันที่สั่งผลิต/จัดส่งก่อนเห็น/แก้กริดรายการ — ข้ามตอนแก้ไขใบเก่า (วันที่ fix จากตอนสร้างแล้ว ไม่ใช่ "เริ่มกรอกใหม่") ──
  const pairKey = `${orderDate}|${deliveryDate}`;
  const gate = useConfirmGate("yc:restock:gate:production", pairKey);
  const confirmed = editOrderId != null ? true : gate.confirmed;
  const confirm = gate.confirm;

  // ── สะท้อนข้อมูลจากหน้า "ต้องเติม" แบบเข้มงวด — เอาเฉพาะรายการที่แต่ละสาขาบันทึกไว้"ตรงกับวันที่จัดส่งนี้เป๊ะ" เท่านั้น ──
  // (ไม่ใช่ค่าล่าสุดของสาขานั้นแบบไม่สนวันที่ — กันโชว์ตัวเลขของรอบอื่นที่บันทึกไว้ล่วงหน้า/ย้อนหลังมาปนกัน)
  // โหมดแก้ไขใบเก่า: ข้าม reflected pre-fill ทั้งหมด — ค่าที่โหลดจากใบที่บันทึกไว้คือความจริงของใบนี้ ไม่ควรถูกค่าจาก restock ปัจจุบันมาปน (คนละบริบทเวลา)
  const [reflected, setReflected] = React.useState<Record<string, Partial<Record<Branch, string>>>>({});
  const [reflectedG, setReflectedG] = React.useState<Record<string, Partial<Record<Branch, string>>>>({});
  const [reflectedLoading, setReflectedLoading] = React.useState(true);
  const [reflectedError, setReflectedError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (editOrderId != null) { setReflectedLoading(false); return; }
    let alive = true;
    setReflectedLoading(true);
    setReflectedError(null);
    Promise.all(
      BRANCHES.map((b) =>
        fetch(`/api/restock/selections?branch=${b}&date=${deliveryDate}`).then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw new Error((data as any)?.error ?? `โหลดตัวเลือกสาขา ${b} ไม่สำเร็จ`);
          return { branch: b, entries: (data as { entries: Record<string, { selected: boolean; qty: number; qtyG: number }> }).entries };
        })
      )
    )
      .then((results) => {
        if (!alive) return;
        const out: Record<string, Partial<Record<Branch, string>>> = {};
        const outG: Record<string, Partial<Record<Branch, string>>> = {};
        for (const { branch, entries } of results) {
          for (const itemId in entries) {
            if (!entries[itemId].selected) continue;
            if (!out[itemId]) out[itemId] = {};
            out[itemId][branch] = String(entries[itemId].qty);
            if (entries[itemId].qtyG > 0) {
              if (!outG[itemId]) outG[itemId] = {};
              outG[itemId][branch] = String(entries[itemId].qtyG);
            }
          }
        }
        setReflected(out);
        setReflectedG(outG);
      })
      .catch((e) => { if (alive) setReflectedError(String(e?.message ?? e)); })
      .finally(() => { if (alive) setReflectedLoading(false); });
    return () => { alive = false; };
  }, [deliveryDate, editOrderId]);

  // ── โหลดใบเก่าเต็ม (โหมดแก้ไข) — hydrate orderId/orderDate/deliveryDate/note/prodQty/prodQtyG/extraRows/savedItemIds ──
  // ข้าม fetch ถ้า editOrderId === orderId ที่มีอยู่แล้ว (เพิ่งสร้าง/บันทึกใบนี้เองในคอมโพเนนต์นี้ผ่าน handleSave → onSaved())
  // กันหน้ากระพริบเป็น "กำลังโหลด…" ซ้ำทันทีหลังกด save สำเร็จ ทั้งที่ข้อมูลที่มีอยู่ก็ตรงกับ DB แล้ว
  React.useEffect(() => {
    if (editOrderId == null || editOrderId === orderId) return;
    let alive = true;
    setOrderLoading(true);
    setOrderLoadError(null);
    fetch(`/api/production-orders?id=${editOrderId}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error((data as any)?.error ?? "โหลดใบสั่งผลิตไม่สำเร็จ");
        return data as { order: ProductionOrderRecord };
      })
      .then(({ order }) => {
        if (!alive) return;
        setOrderId(order.id);
        setOrderDate(order.orderDate);
        setDeliveryDate(order.deliveryDate);
        setNote(order.note);
        const qty: Record<string, Partial<Record<ProdField, string>>> = {};
        const qtyG: Record<string, Partial<Record<ProdField, string>>> = {};
        const extras: ExtraRow[] = [];
        const ids: Record<string, number> = {};
        for (const it of order.items) {
          if (it.itemId && it.branch) {
            const field = prodFieldFromBranchKey(it.branch);
            if (!qty[it.itemId]) qty[it.itemId] = {};
            if (!qtyG[it.itemId]) qtyG[it.itemId] = {};
            qty[it.itemId]![field] = String(it.qty);
            if (it.qtyG) qtyG[it.itemId]![field] = String(it.qtyG);
            ids[gridKey(it.itemId, field)] = it.id;
          } else {
            const localId = `extra-${it.id}`;
            extras.push({ id: localId, name: it.extraName ?? "", qty: it.qty ? String(it.qty) : "", unit: it.extraUnit ?? "", note: it.extraNote ?? "" });
            ids[localId] = it.id;
          }
        }
        setProdQty(qty);
        setProdQtyG(qtyG);
        setExtraRows(extras);
        setSavedItemIds(ids);
        setRemovedExtraIds([]);
        setDirty(false);
        setLastSavedAt(new Date(order.updatedAt));
      })
      .catch((e) => { if (alive) setOrderLoadError(String(e?.message ?? e)); })
      .finally(() => { if (alive) setOrderLoading(false); });
    return () => { alive = false; };
  }, [editOrderId, orderId]);

  const loading = metaLoading || reflectedLoading || orderLoading;
  const error = metaError || reflectedError || orderLoadError;

  function setProd(itemId: string, field: ProdField, value: string) {
    setProdQty((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
    setDirty(true);
  }
  function setProdG(itemId: string, field: ProdField, value: string) {
    setProdQtyG((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
    setDirty(true);
  }

  function addExtraRow() {
    const name = extraName.trim();
    if (!name) return;
    setExtraRows((prev) => [
      ...prev,
      { id: `extra-new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, qty: "", unit: "", note: "" },
    ]);
    setExtraName("");
    setDirty(true);
  }
  function removeExtraRow(id: string) {
    // แถวนี้เคย save ไว้แล้ว (มี server id) → ต้องส่งไปลบผ่าน removedItemIds ตอน PATCH ด้วย ไม่งั้นแถวเดิมจะค้างอยู่ใน DB
    const savedId = savedItemIds[id];
    if (savedId != null) setRemovedExtraIds((prev) => [...prev, savedId]);
    setExtraRows((prev) => prev.filter((r) => r.id !== id));
    setDirty(true);
  }
  function patchExtraRow(id: string, patch: Partial<ExtraRow>) {
    setExtraRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty(true);
  }

  const mainGroups = React.useMemo(() => {
    if (!meta) return [] as { category: string; items: Item[] }[];
    const shown = meta.items
      .filter((it) => PRODUCTION_ITEMS_MAIN.includes(it.name))
      .sort((a, b) => a.sort - b.sort);
    const out: { category: string; items: Item[] }[] = [];
    for (const it of shown) {
      let g = out.find((x) => x.category === it.category);
      if (!g) { g = { category: it.category, items: [] }; out.push(g); }
      g.items.push(it);
    }
    return out;
  }, [meta]);

  const dept2Items = React.useMemo(() => {
    if (!meta) return [] as Item[];
    return meta.items
      .filter((it) => PRODUCTION_ITEMS_DEPT2.includes(it.name))
      .sort((a, b) => a.sort - b.sort);
  }, [meta]);

  function valuesFor(itemId: string): Partial<Record<ProdField, string>> {
    return { ...reflected[itemId], ...prodQty[itemId] };
  }
  function gValuesFor(itemId: string): Partial<Record<ProdField, string>> {
    return { ...reflectedG[itemId], ...prodQtyG[itemId] };
  }
  // raw = ยอดรวมไว้เช็คว่ามีอะไรให้โชว์ไหม (กรัมรวมสำหรับรายการที่มีเศษ, แพ็คธรรมดาสำหรับรายการทั่วไป)
  // text = ข้อความที่จะพิมพ์/export จริง (เช่น "2 แพ็ค + 50g")
  function totalFor(it: Item): { raw: number; text: string } {
    const v = valuesFor(it.id);
    const packSum = PROD_FIELDS.reduce((s, f) => s + (parseFloat(v[f.key] ?? "") || 0), 0);
    if (!it.variableYield) return { raw: packSum, text: String(packSum) };
    const gv = gValuesFor(it.id);
    const gSum = PROD_FIELDS.reduce((s, f) => s + (parseFloat(gv[f.key] ?? "") || 0), 0);
    const totalG = packSum * it.gramsPerUOM + gSum;
    const wholePacks = Math.floor(totalG / it.gramsPerUOM);
    const remG = totalG % it.gramsPerUOM;
    return { raw: totalG, text: formatOrderQty(wholePacks, remG, true, it.isCup ? "ชิ้น" : "g") };
  }
  function isReflected(itemId: string): boolean {
    return (!!reflected[itemId] && Object.keys(reflected[itemId]).length > 0)
      || (!!reflectedG[itemId] && Object.keys(reflectedG[itemId]).length > 0);
  }
  // ข้อความต่อสาขา ใช้ทั้ง CSV/ใบพิมพ์ — รวมแพ็ค+เศษเป็นข้อความเดียว ("2 แพ็ค + 700g") ถ้ารายการนี้มีเศษ
  function fieldTextFor(it: Item, field: ProdField): string {
    const pack = parseFloat(valuesFor(it.id)[field] ?? "") || 0;
    if (!it.variableYield) return valuesFor(it.id)[field] ?? "";
    const g = parseFloat(gValuesFor(it.id)[field] ?? "") || 0;
    if (pack === 0 && g === 0) return "";
    return formatOrderQty(pack, g, true, it.isCup ? "ชิ้น" : "g");
  }

  // ── v1.5: รวม prodQty/prodQtyG (กริดหลัก) + extraRows → payload ส่งขึ้น POST/PATCH /api/production-orders ──
  // ใส่ id จาก savedItemIds ถ้าแถวนี้เคย save แล้ว (server รู้ว่าเป็นการแก้ ไม่ใช่แถวใหม่)
  function buildItemsPayload(): ProductionOrderItemInput[] {
    const items: ProductionOrderItemInput[] = [];
    const gridItems = [...mainGroups.flatMap((g) => g.items), ...dept2Items];
    for (const it of gridItems) {
      const v = valuesFor(it.id);
      const gv = gValuesFor(it.id);
      for (const f of PROD_FIELDS) {
        const pack = parseFloat(v[f.key] ?? "") || 0;
        const gramQty = parseFloat(gv[f.key] ?? "") || 0;
        const key = gridKey(it.id, f.key);
        const existingId = savedItemIds[key];
        // ช่องที่ไม่เคย save และยังเป็น 0 อยู่ — ไม่ต้องส่งขึ้นไปเปล่าๆ (backend กรองซ้ำอีกชั้นตามข้อ 0.6 อยู่แล้ว)
        if (pack === 0 && gramQty === 0 && existingId == null) continue;
        items.push({ id: existingId, itemId: it.id, branch: branchKeyFromProdField(f.key), qty: pack, qtyG: gramQty });
      }
    }
    for (const r of extraRows) {
      items.push({
        id: savedItemIds[r.id], extraName: r.name, extraUnit: r.unit || undefined, extraNote: r.note || undefined,
        qty: parseFloat(r.qty) || 0, qtyG: 0,
      });
    }
    return items;
  }

  // จับคู่ items ที่ server คืนกลับมาหลัง save → savedItemIds ใหม่ (คีย์กริดจับคู่ตรงด้วย itemId+branch เป๊ะ,
  // รายการพิเศษที่เพิ่งสร้างใหม่ไม่มี natural key ให้จับ จึงจับคู่ตามลำดับเดิมที่ส่งไป — ใช้ได้เพราะ insert 1 ครั้งคง order เดิม)
  function syncSavedItemIds(items: ProductionOrderItemRecord[]) {
    const ids: Record<string, number> = {};
    for (const it of items) {
      if (it.itemId && it.branch) ids[gridKey(it.itemId, prodFieldFromBranchKey(it.branch))] = it.id;
    }
    const alreadyKnownIds = new Set(Object.values(savedItemIds));
    const newExtraDbItems = items.filter((it) => !it.itemId && !alreadyKnownIds.has(it.id));
    let cursor = 0;
    for (const row of extraRows) {
      const existingId = savedItemIds[row.id];
      if (existingId != null) ids[row.id] = existingId;
      else if (cursor < newExtraDbItems.length) ids[row.id] = newExtraDbItems[cursor++].id;
    }
    setSavedItemIds(ids);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const items = buildItemsPayload();
      if (orderId == null) {
        const res = await fetch("/api/production-orders", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderDate, deliveryDate, note, items }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
        setOrderId(data.order.id);
        syncSavedItemIds(data.order.items);
        onSaved(data.order.id);
      } else {
        const res = await fetch("/api/production-orders", {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: orderId, orderDate, deliveryDate, note, items, removedItemIds: removedExtraIds }),
        });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
        syncSavedItemIds(data.order.items);
        setRemovedExtraIds([]);
      }
      setDirty(false);
      setLastSavedAt(new Date());
    } catch (e: any) {
      window.alert(`บันทึกไม่สำเร็จ: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  function exportCsv() {
    const lines = [
      `วันที่สั่งผลิต,${orderDate}`,
      `วันที่จัดส่งเข้าสาขา,${deliveryDate}`,
      "",
      "หมวด,รายการ,SND,NVP,KCN,อื่นๆ,รวมสั่งผลิต",
    ];
    for (const g of mainGroups) {
      for (const it of g.items) {
        lines.push([
          csvEscape(g.category), csvEscape(it.name),
          csvEscape(fieldTextFor(it, "SND")), csvEscape(fieldTextFor(it, "NVP")),
          csvEscape(fieldTextFor(it, "KCN")), csvEscape(fieldTextFor(it, "other")),
          csvEscape(totalFor(it).text),
        ].join(","));
      }
    }
    for (const it of dept2Items) {
      lines.push([
        csvEscape("แผนกอื่น"), csvEscape(it.name),
        csvEscape(fieldTextFor(it, "SND")), csvEscape(fieldTextFor(it, "NVP")),
        csvEscape(fieldTextFor(it, "KCN")), csvEscape(fieldTextFor(it, "other")),
        csvEscape(totalFor(it).text),
      ].join(","));
    }
    for (const r of extraRows) {
      lines.push([
        csvEscape("รายการพิเศษ (ครั้งเดียว)"), csvEscape(r.name),
        "", "", "", csvEscape(r.qty || "0") + (r.unit ? " " + csvEscape(r.unit) : ""),
        r.qty || "0",
      ].join(","));
      if (r.note.trim()) lines.push(",หมายเหตุ: " + csvEscape(r.note.trim()) + ",,,,,");
    }
    if (note.trim()) {
      lines.push("");
      lines.push(`หมายเหตุรวม,${csvEscape(note.trim())}`);
    }
    lines.push(...SIGNATURE_FOOTER_LINES);
    downloadCsv(lines.join("\n"), `production_order_${orderDate}.csv`);
    logExport("export_production_csv", "all", orderDate, `export CSV สั่งผลิต`);
  }

  // ── ใบสั่งผลิตพิมพ์ A4 — เอาเฉพาะรายการที่มีจำนวนจริง (รวม > 0) กันโชว์แถว 0 รก ──
  const printGroups = React.useMemo(() => {
    const out: { category: string; items: ProdPrintRow[] }[] = [];
    function pushRow(category: string, row: ProdPrintRow) {
      let g = out.find((x) => x.category === category);
      if (!g) { g = { category, items: [] }; out.push(g); }
      g.items.push(row);
    }
    for (const g of mainGroups) {
      for (const it of g.items) {
        const total = totalFor(it);
        if (total.raw <= 0) continue;
        pushRow(g.category, {
          id: it.id, name: it.name,
          snd: fieldTextFor(it, "SND"), nvp: fieldTextFor(it, "NVP"), kcn: fieldTextFor(it, "KCN"), other: fieldTextFor(it, "other"),
          total: total.text, note: "",
        });
      }
    }
    for (const it of dept2Items) {
      const total = totalFor(it);
      if (total.raw <= 0) continue;
      pushRow("แผนกอื่น", {
        id: it.id, name: it.name,
        snd: fieldTextFor(it, "SND"), nvp: fieldTextFor(it, "NVP"), kcn: fieldTextFor(it, "KCN"), other: fieldTextFor(it, "other"),
        total: total.text, note: "",
      });
    }
    for (const r of extraRows) {
      pushRow("รายการพิเศษ", { id: r.id, name: r.name, snd: "", nvp: "", kcn: "", other: r.unit || "", total: r.qty || "0", note: r.note });
    }
    return out;
  }, [mainGroups, dept2Items, extraRows, reflected, reflectedG, prodQty, prodQtyG]);
  const printTotal = React.useMemo(() => printGroups.reduce((s, g) => s + g.items.length, 0), [printGroups]);

  function printSlip() {
    if (printTotal === 0) {
      window.alert("ยังไม่มีรายการที่จะสั่งผลิต (ทุกช่องยังเป็น 0)");
      return;
    }
    if (printTotal > PRODUCTION_PRINT_OVERFLOW_THRESHOLD) {
      const ok = window.confirm(
        `รายการที่จะสั่งผลิต ${printTotal} รายการ อาจล้นหน้า A4 ใบเดียว\nต้องการพิมพ์ต่อไหม?`
      );
      if (!ok) return;
    }
    logExport("print_production_slip", "all", orderDate, `พิมพ์ใบสั่งผลิต ${printTotal} รายการ`);
    window.print();
  }

  if (loading) {
    return <GlassCard><p className="text-sm text-brand-ink/50">กำลังโหลด…</p></GlassCard>;
  }
  if (error) {
    return <GlassCard><p className="text-sm text-warn">โหลดข้อมูลไม่สำเร็จ: {error}</p></GlassCard>;
  }

  return (
    <>
    <div className="print:hidden">
      <GlassCard className="mb-3">
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">วันที่สั่งผลิต</span>
            <input type="date" value={orderDate} onChange={(e) => { setOrderDate(e.target.value || todayISO()); setDirty(true); }} className="field" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">วันที่จัดส่งเข้าสาขา</span>
            <input type="date" value={deliveryDate} onChange={(e) => { setDeliveryDate(e.target.value || todayISO()); setDirty(true); }} className="field" />
          </label>
        </div>
      </GlassCard>

      {!confirmed ? (
        // ข้อ 3: gate inline แทนกริดรายการทั้งหมด — date picker ด้านบนยังแก้ได้ก่อนยืนยัน
        <GlassCard className="mb-3">
          <h2 className="mb-2 text-[15px] font-semibold">ยืนยันวันที่ก่อนเริ่มกรอก</h2>
          <p className="mb-4 text-sm leading-relaxed text-brand-ink/60">
            สั่งผลิตวันที่ <b className="text-brand-ink">{thaiDateSlash(orderDate)}</b>
            <br />
            จัดส่งเข้าสาขาวันที่ <b className="text-brand-ink">{thaiDateSlash(deliveryDate)}</b>
          </p>
          <Button onClick={confirm}>✅ ยืนยัน เริ่มกรอกรายการ</Button>
        </GlassCard>
      ) : (
        <>
          {mainGroups.map((g, gi) => (
            <Accordion key={g.category} title={g.category} count={`${g.items.length} รายการ`} defaultOpen={gi === 0}>
              <div className="grid gap-2 py-1">
                {g.items.map((it) => (
                  <ProductionRow
                    key={it.id}
                    item={it}
                    par={meta?.par[it.id] ?? {}}
                    values={valuesFor(it.id)}
                    gValues={gValuesFor(it.id)}
                    onChange={(f, v) => setProd(it.id, f, v)}
                    onChangeG={(f, v) => setProdG(it.id, f, v)}
                    reflected={isReflected(it.id)}
                  />
                ))}
              </div>
            </Accordion>
          ))}

          <p className="my-3 text-center text-xs text-brand-ink/40">
            ── 🍪 แผนกอื่น (แยกจากไลน์ผลิตหลัก — ใส่ชื่อแผนกจริงแทนได้) ──
          </p>

          <Accordion title="🍪 แผนกอื่น" count={`${dept2Items.length} รายการ`} defaultOpen={false}>
            <div className="grid gap-2 py-1">
              {dept2Items.map((it) => (
                <ProductionRow
                  key={it.id}
                  item={it}
                  par={meta?.par[it.id] ?? {}}
                  values={valuesFor(it.id)}
                  gValues={gValuesFor(it.id)}
                  onChange={(f, v) => setProd(it.id, f, v)}
                  onChangeG={(f, v) => setProdG(it.id, f, v)}
                  tone="orange"
                  isNew={NEW_ITEM_NAMES.includes(it.name)}
                  reflected={isReflected(it.id)}
                />
              ))}
            </div>
          </Accordion>
        </>
      )}

      <GlassCard className="mt-3">
        <h3 className="mb-2.5 text-[15px] font-semibold">➕ เพิ่มรายการสั่งผลิตพิเศษ</h3>
        <div className="mb-3 flex gap-2">
          <input
            value={extraName}
            onChange={(e) => setExtraName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addExtraRow(); }}
            placeholder="ชื่อรายการ"
            className="field flex-1"
          />
          <button
            type="button"
            onClick={addExtraRow}
            className="shrink-0 rounded-xl bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white active:scale-[.98]"
          >
            เพิ่ม
          </button>
        </div>
        {extraRows.length > 0 && (
          <div className="grid gap-2">
            {extraRows.map((r) => (
              <div key={r.id} className="rounded-lg bg-black/[.03] px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-sm font-medium">{r.name}</span>
                  <input
                    inputMode="numeric"
                    value={r.qty}
                    onChange={(e) => patchExtraRow(r.id, { qty: e.target.value })}
                    placeholder="จำนวน"
                    className="field w-16 px-1.5 py-1 text-right text-xs"
                  />
                  <input
                    value={r.unit}
                    onChange={(e) => patchExtraRow(r.id, { unit: e.target.value })}
                    placeholder="หน่วย"
                    className="field w-16 px-1.5 py-1 text-center text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => removeExtraRow(r.id)}
                    className="shrink-0 text-brand-ink/40"
                    aria-label={`ลบ ${r.name}`}
                  >
                    ✕
                  </button>
                </div>
                <input
                  value={r.note}
                  onChange={(e) => patchExtraRow(r.id, { note: e.target.value })}
                  placeholder="หมายเหตุ (ถ้ามี)"
                  className="field mt-1.5 w-full px-2 py-1 text-left text-xs"
                />
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard className="mt-3">
        <h3 className="mb-2 text-[15px] font-semibold">📝 หมายเหตุ</h3>
        <textarea
          value={note}
          onChange={(e) => { setNote(e.target.value); setDirty(true); }}
          rows={3}
          placeholder="พิมพ์หมายเหตุ (ถ้ามี)"
          className="field w-full resize-none"
        />
      </GlassCard>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={exportCsv}
          className="rounded-xl bg-white/70 px-4 py-3 text-[14px] font-semibold text-brand-ink border border-black/10 active:scale-[.98]"
        >
          📤 Export (CSV)
        </button>
        <button
          type="button"
          onClick={printSlip}
          className="rounded-xl bg-brand-ink px-4 py-3 text-[14px] font-semibold text-white active:scale-[.98]"
        >
          🖨️ พิมพ์ใบสั่งผลิต
        </button>
      </div>

      {/* v1.5: persist ใบสั่งผลิตลง DB — export/พิมพ์ยังทำงานได้โดยไม่ต้อง save ก่อน (ใช้ค่าจาก local buffer ตรงๆ เหมือนโหมด A เฟส 1) */}
      <SaveBar>
        {dirty ? (
          <p className="mb-2 rounded-lg bg-warn/10 px-3 py-2 text-center text-xs font-medium text-warn">
            ⚠️ มีการแก้ไขยังไม่บันทึก
          </p>
        ) : lastSavedAt ? (
          <p className="mb-2 rounded-lg bg-ok/10 px-3 py-2 text-center text-xs font-medium text-ok">
            ✓ บันทึกล่าสุด {formatTime(lastSavedAt)} น. — ใบ #{orderId}
          </p>
        ) : null}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "กำลังบันทึก…" : orderId == null ? "💾 บันทึกคำสั่งผลิต" : "💾 บันทึกการแก้ไข"}
        </Button>
      </SaveBar>
    </div>
    <ProductionPrintSheet
      orderDate={orderDate} deliveryDate={deliveryDate}
      printGroups={printGroups} totalCount={printTotal} note={note}
    />
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════
// โหมด C — ประวัติสั่งผลิต (v1.5) — list → detail 2 ระดับ + ติ๊กคอนเฟิร์มทีละ item×สาขา
// ══════════════════════════════════════════════════════════════════════
function ProductionHistory({ onEdit }: { onEdit: (id: number) => void }) {
  const me = useMe();
  const isAdmin = me?.role === "admin";
  const [selectedOrderId, setSelectedOrderId] = React.useState<number | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  // ── list view ──
  const [orders, setOrders] = React.useState<ProductionOrderSummary[]>([]);
  const [listLoading, setListLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (selectedOrderId != null) return; // อยู่ใน detail view ไม่ต้องโหลด list ซ้ำ
    let alive = true;
    setListLoading(true);
    setListError(null);
    fetch("/api/production-orders")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error((data as any)?.error ?? "โหลดประวัติสั่งผลิตไม่สำเร็จ");
        return data as { orders: ProductionOrderSummary[] };
      })
      .then((data) => { if (alive) setOrders(data.orders); })
      .catch((e) => { if (alive) setListError(String(e?.message ?? e)); })
      .finally(() => { if (alive) setListLoading(false); });
    return () => { alive = false; };
  }, [selectedOrderId]);

  // ── meta (ชื่อ/หมวด/variableYield ของ item) — ใช้จัดกลุ่มรายการใน detail view ──
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [metaLoading, setMetaLoading] = React.useState(true);
  React.useEffect(() => {
    let alive = true;
    fetch("/api/meta")
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error((data as any)?.error ?? "โหลด meta ไม่สำเร็จ");
        return data as Meta;
      })
      .then((m) => { if (alive) setMeta(m); })
      .finally(() => { if (alive) setMetaLoading(false); });
    return () => { alive = false; };
  }, []);

  // ── detail view ──
  const [order, setOrder] = React.useState<ProductionOrderRecord | null>(null);
  const [detailLoading, setDetailLoading] = React.useState(false);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (selectedOrderId == null) { setOrder(null); return; }
    let alive = true;
    setDetailLoading(true);
    setDetailError(null);
    fetch(`/api/production-orders?id=${selectedOrderId}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error((data as any)?.error ?? "โหลดใบสั่งผลิตไม่สำเร็จ");
        return data as { order: ProductionOrderRecord };
      })
      .then((data) => { if (alive) setOrder(data.order); })
      .catch((e) => { if (alive) setDetailError(String(e?.message ?? e)); })
      .finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [selectedOrderId]);

  // จัดกลุ่มรายการกริดหลัก (item×branch) ตาม category เหมือนหน้าสั่งผลิต — ต่อ item รวม 4 คอลัมน์สาขาไว้แถวเดียว
  const groupedCategories = React.useMemo(() => {
    if (!order || !meta) return [] as [string, { item: Item; cells: Partial<Record<ProdBranchKey, ProductionOrderItemRecord>> }[]][];
    const itemById = new Map(meta.items.map((it) => [it.id, it]));
    const byItem = new Map<string, Partial<Record<ProdBranchKey, ProductionOrderItemRecord>>>();
    for (const it of order.items) {
      if (!it.itemId || !it.branch) continue;
      const cellMap = byItem.get(it.itemId) ?? {};
      cellMap[it.branch] = it;
      byItem.set(it.itemId, cellMap);
    }
    const rows: { item: Item; cells: Partial<Record<ProdBranchKey, ProductionOrderItemRecord>> }[] = [];
    for (const [itemId, cells] of byItem) {
      const item = itemById.get(itemId);
      if (item) rows.push({ item, cells });
    }
    rows.sort((a, b) => a.item.sort - b.item.sort);
    const groups = new Map<string, typeof rows>();
    for (const r of rows) {
      const arr = groups.get(r.item.category) ?? [];
      arr.push(r);
      groups.set(r.item.category, arr);
    }
    return Array.from(groups.entries());
  }, [order, meta]);

  const extraItems = React.useMemo(() => (order?.items ?? []).filter((it) => !it.itemId), [order]);

  // optimistic update local state ก่อน (responsive) → PATCH → ล้มเหลว rollback + window.alert (pattern เดียวกับ handleSave ที่อื่นในระบบ)
  async function onToggleConfirm(itemRowId: number, next: boolean) {
    setOrder((prev) => prev && { ...prev, items: prev.items.map((it) => (it.id === itemRowId ? { ...it, confirmed: next } : it)) });
    try {
      const res = await fetch("/api/production-orders/items", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemRowId, confirmed: next }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      setOrder((prev) => prev && { ...prev, items: prev.items.map((it) => (it.id === itemRowId ? data.item : it)) });
    } catch (e: any) {
      setOrder((prev) => prev && { ...prev, items: prev.items.map((it) => (it.id === itemRowId ? { ...it, confirmed: !next } : it)) });
      window.alert(`บันทึกไม่สำเร็จ: ${e?.message ?? e}`);
    }
  }

  async function onEditConfirmedQty(itemRowId: number, confirmedQty: number, confirmedQtyG: number) {
    const prevItem = order?.items.find((it) => it.id === itemRowId);
    setOrder((prev) => prev && { ...prev, items: prev.items.map((it) => (it.id === itemRowId ? { ...it, confirmedQty, confirmedQtyG } : it)) });
    try {
      const res = await fetch("/api/production-orders/items", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: itemRowId, confirmedQty, confirmedQtyG }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      setOrder((prev) => prev && { ...prev, items: prev.items.map((it) => (it.id === itemRowId ? data.item : it)) });
    } catch (e: any) {
      if (prevItem) setOrder((prev) => prev && { ...prev, items: prev.items.map((it) => (it.id === itemRowId ? prevItem : it)) });
      window.alert(`บันทึกไม่สำเร็จ: ${e?.message ?? e}`);
    }
  }

  async function handleDeleteOrder() {
    if (!order) return;
    if (!window.confirm(`ลบใบสั่งผลิต ${thaiDateSlash(order.orderDate)} นี้? ลบแล้วกู้คืนไม่ได้`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/production-orders?id=${order.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "ลบไม่สำเร็จ");
      setSelectedOrderId(null);
    } catch (e: any) {
      window.alert(`ลบไม่สำเร็จ: ${e?.message ?? e}`);
    } finally {
      setDeleting(false);
    }
  }

  function badgeToneFor(o: ProductionOrderSummary): "ok" | "warn" | "neutral" {
    if (o.itemCount === 0) return "neutral";
    if (o.confirmedCount === o.itemCount) return "ok";
    if (o.confirmedCount === 0) return "warn";
    return "neutral";
  }

  // ── list view ──
  if (selectedOrderId == null) {
    return (
      <div className="print:hidden">
        {listLoading ? (
          <GlassCard><p className="text-sm text-brand-ink/50">กำลังโหลด…</p></GlassCard>
        ) : listError ? (
          <GlassCard><p className="text-sm text-warn">โหลดข้อมูลไม่สำเร็จ: {listError}</p></GlassCard>
        ) : orders.length === 0 ? (
          <GlassCard><p className="text-sm text-brand-ink/50">ยังไม่มีใบสั่งผลิต</p></GlassCard>
        ) : (
          orders.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setSelectedOrderId(o.id)}
              className="glass-soft mb-2 block w-full px-3.5 py-3 text-left"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[14px] font-medium">
                  <span className="text-brand-ink/45">ใบ #{o.id}</span> · สั่งผลิต {thaiDateSlash(o.orderDate)} → ส่ง {thaiDateSlash(o.deliveryDate)}
                </span>
                <Badge tone={badgeToneFor(o)}>{o.confirmedCount}/{o.itemCount}</Badge>
              </div>
              <p className="text-xs text-brand-ink/50">
                {o.itemCount} รายการ · คอนเฟิร์มแล้ว {o.confirmedCount}/{o.itemCount} · โดย {o.createdByName}
              </p>
            </button>
          ))
        )}
      </div>
    );
  }

  // ── detail view ──
  const detailReady = !detailLoading && !metaLoading && !!order;
  return (
    <div className="print:hidden">
      <button
        type="button"
        onClick={() => setSelectedOrderId(null)}
        className="mb-3 text-sm font-medium text-brand-ink/60"
      >
        ← กลับ
      </button>

      {!detailReady ? (
        detailError ? (
          <GlassCard><p className="text-sm text-warn">โหลดข้อมูลไม่สำเร็จ: {detailError}</p></GlassCard>
        ) : (
          <GlassCard><p className="text-sm text-brand-ink/50">กำลังโหลด…</p></GlassCard>
        )
      ) : (
        <>
          <GlassCard className="mb-3">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold">ใบ #{order!.id} · สั่งผลิต {thaiDateSlash(order!.orderDate)}</h2>
                <p className="text-xs text-brand-ink/50">
                  ส่งเข้าสาขา {thaiDateSlash(order!.deliveryDate)} · โดย {order!.createdByName}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <button
                  type="button"
                  onClick={() => onEdit(order!.id)}
                  className="rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-xs font-semibold text-brand-ink active:scale-[.98]"
                >
                  ✏️ แก้ไขใบนี้
                </button>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={handleDeleteOrder}
                    disabled={deleting}
                    className="rounded-lg border border-brand-red/25 bg-brand-red/5 px-3 py-1.5 text-xs font-semibold text-brand-red active:scale-[.98] disabled:opacity-50"
                  >
                    {deleting ? "กำลังลบ…" : "🗑️ ลบใบนี้"}
                  </button>
                )}
              </div>
            </div>
            {order!.note.trim() && <p className="text-xs text-brand-ink/60">📝 {order!.note}</p>}
          </GlassCard>

          {groupedCategories.map(([category, rows], gi) => (
            <Accordion key={category} title={category} count={`${rows.length} รายการ`} defaultOpen={gi === 0}>
              <div className="grid gap-2 py-1">
                {rows.map(({ item, cells }) => (
                  <ConfirmRow
                    key={item.id}
                    name={item.name}
                    hasG={item.variableYield}
                    gUnit={item.isCup ? "ชิ้น" : "g"}
                    cells={cells}
                    onToggleConfirm={onToggleConfirm}
                    onEditConfirmedQty={onEditConfirmedQty}
                  />
                ))}
              </div>
            </Accordion>
          ))}

          {extraItems.length > 0 && (
            <Accordion title="รายการพิเศษ" count={`${extraItems.length} รายการ`} defaultOpen>
              <div className="grid gap-2 py-1">
                {extraItems.map((it) => (
                  <div key={it.id} className="glass-soft px-3 py-2.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{it.extraName}</span>
                      <span className="text-xs text-brand-ink/60">
                        {it.qty || 0}{it.extraUnit ? ` ${it.extraUnit}` : ""}
                      </span>
                    </div>
                    {it.extraNote && <p className="mb-1.5 text-xs text-brand-ink/45">{it.extraNote}</p>}
                    <ConfirmCell
                      label="รับแล้ว"
                      item={it}
                      hasG={false}
                      gUnit=""
                      onToggleConfirm={onToggleConfirm}
                      onEditConfirmedQty={onEditConfirmedQty}
                    />
                  </div>
                ))}
              </div>
            </Accordion>
          )}
        </>
      )}
    </div>
  );
}

// ── local component: 1 แถว = 1 รายการกริดหลัก แสดง 4 คอลัมน์สาขา (SND/NVP/KCN/อื่นๆ) พร้อมติ๊กคอนเฟิร์มต่อคอลัมน์ ──
// โครง 4-column grid เดียวกับ ProductionRow เดิม เพื่อความคุ้นตา (ดู spec ข้อ 6.3)
function ConfirmRow({
  name, hasG, gUnit, cells, onToggleConfirm, onEditConfirmedQty,
}: {
  name: string;
  hasG: boolean;
  gUnit: string;
  cells: Partial<Record<ProdBranchKey, ProductionOrderItemRecord>>;
  onToggleConfirm: (id: number, next: boolean) => void;
  onEditConfirmedQty: (id: number, confirmedQty: number, confirmedQtyG: number) => void;
}) {
  return (
    <div className="glass-soft px-3 py-2.5">
      <div className="mb-2 text-sm font-medium">{name}</div>
      <div className="grid grid-cols-4 gap-1.5">
        {PROD_FIELDS.map((f) => {
          const cell = cells[branchKeyFromProdField(f.key)];
          if (!cell || (cell.qty <= 0 && cell.qtyG <= 0)) {
            return (
              <div key={f.key} className="flex flex-col items-center gap-0.5 pt-3 opacity-30">
                <span className="text-[8.5px] leading-tight text-brand-ink/50">{f.label}</span>
                <span className="text-xs">—</span>
              </div>
            );
          }
          return (
            <ConfirmCell
              key={f.key}
              label={f.label}
              item={cell}
              hasG={hasG}
              gUnit={gUnit}
              onToggleConfirm={onToggleConfirm}
              onEditConfirmedQty={onEditConfirmedQty}
            />
          );
        })}
      </div>
    </div>
  );
}

// ── local component: 1 ช่อง (item×สาขา หรือ รายการพิเศษ 1 แถว) — จำนวนที่สั่ง (read-only) + checkbox รับแล้ว + แก้จำนวนจริงได้อิสระ ──
function ConfirmCell({
  label, item, hasG, gUnit, onToggleConfirm, onEditConfirmedQty,
}: {
  label: string;
  item: ProductionOrderItemRecord;
  hasG: boolean;
  gUnit: string;
  onToggleConfirm: (id: number, next: boolean) => void;
  onEditConfirmedQty: (id: number, confirmedQty: number, confirmedQtyG: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [cq, setCq] = React.useState(String(item.confirmedQty ?? item.qty));
  const [cqG, setCqG] = React.useState(String(item.confirmedQtyG ?? item.qtyG));
  const orderedText = formatOrderQty(item.qty, item.qtyG, hasG, gUnit);
  const mismatch = item.confirmed && (
    (item.confirmedQty ?? item.qty) !== item.qty || (item.confirmedQtyG ?? item.qtyG) !== item.qtyG
  );

  return (
    <label className="flex flex-col items-center gap-0.5">
      <span className="text-[8.5px] leading-tight text-brand-ink/50">{label}</span>
      <span className="text-xs font-medium">{orderedText}</span>
      <input
        type="checkbox"
        checked={item.confirmed}
        onChange={(e) => onToggleConfirm(item.id, e.target.checked)}
        className="h-4 w-4 rounded border-black/20"
        aria-label={`รับแล้ว ${label}`}
      />
      {item.confirmed && (
        <Badge tone={mismatch ? "warn" : "ok"}>
          {mismatch
            ? `ได้จริง ${formatOrderQty(item.confirmedQty ?? item.qty, item.confirmedQtyG ?? item.qtyG, hasG, gUnit)}`
            : "รับแล้ว"}
        </Badge>
      )}
      {!editing ? (
        <button type="button" onClick={() => setEditing(true)} className="text-[9px] text-brand-ink/40 underline">
          แก้จำนวนจริง
        </button>
      ) : (
        <div className="flex flex-col items-center gap-1">
          <input
            inputMode="numeric"
            value={cq}
            onChange={(e) => setCq(e.target.value)}
            className="field w-12 px-1 py-0.5 text-center text-[10px]"
          />
          {hasG && (
            <input
              inputMode="numeric"
              value={cqG}
              onChange={(e) => setCqG(e.target.value)}
              placeholder={`+${gUnit}`}
              className="field w-12 px-1 py-0.5 text-center text-[10px]"
            />
          )}
          <button
            type="button"
            onClick={() => { onEditConfirmedQty(item.id, Number(cq) || 0, Number(cqG) || 0); setEditing(false); }}
            className="text-[9px] font-semibold text-brand-blue"
          >
            ✓ บันทึก
          </button>
        </div>
      )}
    </label>
  );
}
