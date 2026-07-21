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
import type { Branch, Weekday, RestockRow, RestockSelectionEntry, Meta, Item } from "@/lib/types";
import { BRANCH_LABEL_TH, BRANCHES } from "@/lib/types";
import { specialDayLabel, weekdayFromDate, isSpecialActive } from "@/lib/calc";
import { todayISO } from "@/lib/fmt";

const WEEKDAY_LABEL_TH: Record<Weekday, string> = {
  sun: "อาทิตย์", mon: "จันทร์", tue: "อังคาร", wed: "พุธ", thu: "พฤหัสบดี", fri: "ศุกร์", sat: "เสาร์",
};

type Mode = "byBranch" | "production";
const MODE_OPTS = [
  { value: "byBranch" as Mode, label: "📦 ต้องเติมรายสาขา" },
  { value: "production" as Mode, label: "🏭 สั่งผลิต (รวมทุกสาขา)" },
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

// ── CSV helpers (ใช้ร่วมทั้ง 2 โหมด) ──
function csvEscape(s: string): string {
  const str = String(s ?? "");
  const needsQuote = str.indexOf(",") >= 0 || str.indexOf('"') >= 0 || str.indexOf("\n") >= 0;
  if (!needsQuote) return str;
  return '"' + str.split('"').join('""') + '"';
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
// จัด 2 คอลัมน์อัตโนมัติ (แบ่งที่ขอบหมวดใกล้ครึ่งหนึ่ง กันหมวดเดียวกันขาดคอลัมน์) ให้พอดี A4 ใบเดียว
type PrintRow = RestockRow & { qty: string };
const PRINT_OVERFLOW_THRESHOLD = 70; // รายการเกินนี้อาจล้นหน้า A4 — เตือนก่อนพิมพ์

function PrintSheet({
  branch, date, weekdayLabel, printGroups, totalCount,
}: {
  branch: Branch; date: string; weekdayLabel: string;
  printGroups: { category: string; items: PrintRow[] }[]; totalCount: number;
}) {
  const half = Math.ceil(totalCount / 2);
  const col1: typeof printGroups = [];
  const col2: typeof printGroups = [];
  let count = 0;
  for (const g of printGroups) {
    if (col1.length === 0 || count < half) { col1.push(g); count += g.items.length; }
    else { col2.push(g); }
  }

  function renderColumn(colGroups: typeof printGroups, withExtra: boolean) {
    return (
      <div className="flex-1">
        <table className="w-full border-collapse text-[9px]">
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
                  <td colSpan={4} className="pt-2 text-[7.5px] font-bold uppercase tracking-wide text-neutral-500">
                    {g.category}
                  </td>
                </tr>
                {g.items.map((r) => (
                  <tr key={r.itemId} className="border-b border-neutral-300">
                    <td className="py-[3px]"><span className="inline-block h-[10px] w-[10px] border-[1.3px] border-black" /></td>
                    <td className="py-[3px] text-black">{r.name}</td>
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
          <div className="text-[9px] uppercase tracking-widest text-neutral-500">ใบส่งของเข้าสาขา · Yogurt Culture</div>
          <div className="text-[32px] font-bold leading-none text-black">{branch}</div>
          <div className="mt-0.5 text-[11px] text-neutral-600">{BRANCH_LABEL_TH[branch]}</div>
        </div>
        <div className="text-right">
          <div className="text-[19px] font-semibold leading-none text-black">{thaiDateSlash(date)}</div>
          <div className="text-[11px] text-neutral-600">{weekdayLabel}</div>
        </div>
      </div>
      <div className="mb-2 flex justify-between text-[9.5px] text-neutral-600">
        <span>รวม {totalCount} รายการ</span>
        <span>ผู้จัดเตรียม: ____________________</span>
      </div>

      <div className="flex gap-3.5">
        {renderColumn(col1, col2.length === 0)}
        {col2.length > 0 && renderColumn(col2, true)}
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
  return (
    <div>
      <div className="print:hidden">
        <PageTitle title={mode === "byBranch" ? "รายการสินค้าเข้า" : "สั่งผลิต"} />

        <div className="mb-3">
          <Segmented options={MODE_OPTS} value={mode} onChange={setMode} />
        </div>
      </div>

      {mode === "byBranch" ? <RestockByBranch /> : <ProductionOrder />}
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

  // ── ตัวเลือกที่เลือกไว้ — hydrate จาก DB (ไม่ใช่ store client memory เดิม) ──
  const [selEntries, setSelEntries] = React.useState<Record<string, RestockSelectionEntry>>({});
  const [saving, setSaving] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  // ── snapshot ค่าที่ "บันทึกลง DB แล้วจริง" ล่าสุด (จากการโหลด หรือหลังกดบันทึกสำเร็จ) — undefined ต่อ itemId = ไม่เคยบันทึกคู่นี้เลย
  // ใช้เทียบกับ selEntries เพื่อบอกสถานะแต่ละแถว: แนะนำ (ยังไม่แตะ) / แก้ไขแล้วยังไม่บันทึก / บันทึกแล้ว
  const [savedEntries, setSavedEntries] = React.useState<Record<string, { selected: boolean; qty: number }>>({});

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
        return data as { entries: Record<string, { selected: boolean; qty: number }> };
      }),
    ])
      .then(([restockData, selData]) => {
        if (!alive) return;
        setRows(restockData.rows);
        setSpecialActive(restockData.specialActive);
        // ถ้าเคย save (branch,date) นี้ไว้แล้ว → ใช้ค่าจาก DB ตรงๆ (ไม่ reset กลับ default)
        // ถ้าไม่เคย (หรือเป็นไอเทมใหม่ที่เพิ่มเข้าระบบทีหลัง) → fallback ไป default เดิม (selected = need>0, qty = need)
        const next: Record<string, RestockSelectionEntry> = {};
        for (const r of restockData.rows) {
          const saved = selData.entries[r.itemId];
          next[r.itemId] = saved
            ? { itemId: r.itemId, selected: saved.selected, qty: saved.qty }
            : { itemId: r.itemId, selected: r.need != null && r.need > 0, qty: r.need ?? 0 };
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
      const cur = prev[itemId] ?? { itemId, selected: false, qty: 0 };
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
        const cur = next[r.itemId] ?? { itemId: r.itemId, selected: false, qty: 0 };
        next[r.itemId] = { ...cur, selected: !allSel };
      }
      return next;
    });
  }
  function toggleAllGlobal() {
    toggleCategoryAll(rows);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const entries = rows.map((r) => ({
        itemId: r.itemId,
        selected: selEntries[r.itemId]?.selected ?? false,
        qty: Number(selEntries[r.itemId]?.qty ?? 0),
      }));
      const res = await fetch("/api/restock/selections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, date, entries }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      setLastSavedAt(new Date());
      // อัปเดต snapshot "บันทึกแล้ว" ทันที — ทุกแถวที่เพิ่ง POST ไปกลายเป็นสีเขียวพร้อมกัน ไม่ต้องรอโหลดใหม่
      const nextSaved: Record<string, { selected: boolean; qty: number }> = {};
      for (const e of entries) nextSaved[e.itemId] = { selected: e.selected, qty: e.qty };
      setSavedEntries(nextSaved);
    } catch (e: any) {
      window.alert(`บันทึกไม่สำเร็จ: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  // ค่าที่ระบบเดาให้ตอนยังไม่เคยมีใครกรอก (Par − คงเหลือ) — ใช้เทียบว่าแถวนี้ "ยังไม่ถูกแตะเลย" หรือเปล่า
  function defaultOf(r: RestockRow): { selected: boolean; qty: number } {
    return { selected: r.need != null && r.need > 0, qty: r.need ?? 0 };
  }
  // สถานะต่อแถว: บันทึกแล้ว (ตรงกับ DB) / แก้ไขแล้วยังไม่บันทึก / แนะนำ (ยังไม่แตะ ไม่เคยบันทึกคู่นี้เลย)
  function statusOf(r: RestockRow): "saved" | "dirty" | "suggested" {
    const cur = selEntries[r.itemId] ?? { itemId: r.itemId, selected: false, qty: 0 };
    const saved = savedEntries[r.itemId];
    if (saved && cur.selected === saved.selected && cur.qty === saved.qty) return "saved";
    if (!saved) {
      const def = defaultOf(r);
      if (cur.selected === def.selected && cur.qty === def.qty) return "suggested";
    }
    return "dirty";
  }

  // จัดกลุ่มตาม category (คงลำดับตามที่ backend ส่งมา)
  const groups = React.useMemo(() => {
    const out: { category: string; items: RestockRow[] }[] = [];
    for (const r of rows) {
      let g = out.find((x) => x.category === r.category);
      if (!g) { g = { category: r.category, items: [] }; out.push(g); }
      g.items.push(r);
    }
    return out;
  }, [rows]);

  const selectedTotal = React.useMemo(
    () => rows.filter((r) => selEntries[r.itemId]?.selected).length,
    [rows, selEntries]
  );
  const allChecked = rows.length > 0 && rows.every((r) => selEntries[r.itemId]?.selected);
  const dirtyCount = React.useMemo(
    () => rows.filter((r) => statusOf(r) === "dirty").length,
    [rows, selEntries, savedEntries]
  );

  function exportCsv() {
    const selectedRows = rows.filter((r) => selEntries[r.itemId]?.selected);
    const lines = ["หมวด,รายการ,จำนวนสั่ง"];
    for (const r of selectedRows) {
      const q = selEntries[r.itemId]?.qty ?? 0;
      lines.push([csvEscape(r.category), csvEscape(r.name), String(q)].join(","));
    }
    lines.push(...SIGNATURE_FOOTER_LINES);
    downloadCsv(lines.join("\n"), `restock_${branch}_${date}.csv`);
    logExport("export_restock_csv", branch, date, `export CSV ${selectedRows.length} รายการ`);
  }

  // ── ใบส่งของพิมพ์ A4 ──
  const printGroups = React.useMemo(() => {
    const out: { category: string; items: PrintRow[] }[] = [];
    for (const g of groups) {
      const items = g.items
        .filter((r) => selEntries[r.itemId]?.selected)
        .map((r) => ({ ...r, qty: String(selEntries[r.itemId]?.qty ?? 0) }));
      if (items.length > 0) out.push({ category: g.category, items });
    }
    return out;
  }, [groups, selEntries]);
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
            <span className="shrink-0 text-xs text-brand-ink/50">{rows.length} รายการ</span>
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
                  {selectedTotal}/{rows.length} รายการที่เลือก
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
                    <div>
                      {g.items.map((r) => {
                        const entry = selEntries[r.itemId];
                        const isSel = !!entry?.selected;
                        const inProduction = PRODUCTION_ITEM_NAMES.has(r.name);
                        const status = statusOf(r);
                        return (
                          <div
                            key={r.itemId}
                            className={`mb-0.5 flex min-h-[26px] items-center gap-1.5 rounded-md border-l-[2.5px] px-1.5 py-1 ${
                              isSel
                                ? "border-l-ok bg-ok/10"
                                : "border-l-transparent bg-black/[.02] opacity-50"
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
                              className={`field w-[34px] shrink-0 px-1 py-0.5 text-center text-[11px] ${
                                !isSel
                                  ? "opacity-40"
                                  : status === "saved"
                                    ? "font-semibold border-ok/50 bg-ok/10 text-ok"
                                    : status === "dirty"
                                      ? "font-semibold border-brand-blue bg-brand-blue/15"
                                      : "border-dashed border-black/25 text-brand-ink/45 italic"
                              }`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </SelectableAccordion>
                );
              })}
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
    <PrintSheet branch={branch} date={date} weekdayLabel={dayLabel} printGroups={printGroups} totalCount={printTotal} />
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
  item, par, values, onChange, tone, isNew, reflected,
}: {
  item: Item;
  par: Partial<Record<Branch, number | null>>;
  values: Partial<Record<ProdField, string>>;
  onChange: (field: ProdField, v: string) => void;
  tone?: "orange";
  isNew?: boolean;
  reflected?: boolean;
}) {
  const total = PROD_FIELDS.reduce((s, f) => s + (parseFloat(values[f.key] ?? "") || 0), 0);
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
            </label>
          );
        })}
      </div>
      <div className={`mt-2 text-right text-xs font-semibold ${isOrange ? "text-orange-700" : "text-brand-ink/70"}`}>
        รวมสั่งผลิต: {total}
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
          <div className="text-[9px] uppercase tracking-widest text-neutral-500">ใบสั่งผลิต · Yogurt Culture</div>
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
            <th className="w-3 py-1"></th>
            <th className="py-1 text-left text-[8px] uppercase tracking-wide text-neutral-500">รายการ</th>
            <th className="w-8 py-1 text-center text-[8px] uppercase tracking-wide text-neutral-500">SND<br /><span className="normal-case text-neutral-400">{BRANCH_LABEL_TH.SND}</span></th>
            <th className="w-8 py-1 text-center text-[8px] uppercase tracking-wide text-neutral-500">NVP<br /><span className="normal-case text-neutral-400">{BRANCH_LABEL_TH.NVP}</span></th>
            <th className="w-8 py-1 text-center text-[8px] uppercase tracking-wide text-neutral-500">KCN<br /><span className="normal-case text-neutral-400">{BRANCH_LABEL_TH.KCN}</span></th>
            <th className="w-10 py-1 text-center text-[8px] uppercase tracking-wide text-neutral-500">อื่นๆ</th>
            <th className="w-9 py-1 text-center text-[8px] uppercase tracking-wide text-neutral-500">รวม</th>
            <th className="w-16 py-1 text-center text-[8px] uppercase tracking-wide text-neutral-500">หมายเหตุ</th>
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
                  <td className="py-[3px] text-black">{r.name}</td>
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

function ProductionOrder() {
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [metaError, setMetaError] = React.useState<string | null>(null);
  const [metaLoading, setMetaLoading] = React.useState(true);

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
  const [extraRows, setExtraRows] = React.useState<ExtraRow[]>([]);
  const [extraName, setExtraName] = React.useState("");
  const [note, setNote] = React.useState("");
  const [orderDate, setOrderDate] = React.useState<string>(todayISO());
  const [deliveryDate, setDeliveryDate] = React.useState<string>(todayISO());

  // ── ข้อ 3: gate ยืนยันวันที่สั่งผลิต/จัดส่งก่อนเห็น/แก้กริดรายการ ──
  const pairKey = `${orderDate}|${deliveryDate}`;
  const { confirmed, confirm } = useConfirmGate("yc:restock:gate:production", pairKey);

  // ── สะท้อนข้อมูลจากหน้า "ต้องเติม" แบบเข้มงวด — เอาเฉพาะรายการที่แต่ละสาขาบันทึกไว้"ตรงกับวันที่จัดส่งนี้เป๊ะ" เท่านั้น ──
  // (ไม่ใช่ค่าล่าสุดของสาขานั้นแบบไม่สนวันที่ — กันโชว์ตัวเลขของรอบอื่นที่บันทึกไว้ล่วงหน้า/ย้อนหลังมาปนกัน)
  const [reflected, setReflected] = React.useState<Record<string, Partial<Record<Branch, string>>>>({});
  const [reflectedLoading, setReflectedLoading] = React.useState(true);
  const [reflectedError, setReflectedError] = React.useState<string | null>(null);
  React.useEffect(() => {
    let alive = true;
    setReflectedLoading(true);
    setReflectedError(null);
    Promise.all(
      BRANCHES.map((b) =>
        fetch(`/api/restock/selections?branch=${b}&date=${deliveryDate}`).then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw new Error((data as any)?.error ?? `โหลดตัวเลือกสาขา ${b} ไม่สำเร็จ`);
          return { branch: b, entries: (data as { entries: Record<string, { selected: boolean; qty: number }> }).entries };
        })
      )
    )
      .then((results) => {
        if (!alive) return;
        const out: Record<string, Partial<Record<Branch, string>>> = {};
        for (const { branch, entries } of results) {
          for (const itemId in entries) {
            if (!entries[itemId].selected) continue;
            if (!out[itemId]) out[itemId] = {};
            out[itemId][branch] = String(entries[itemId].qty);
          }
        }
        setReflected(out);
      })
      .catch((e) => { if (alive) setReflectedError(String(e?.message ?? e)); })
      .finally(() => { if (alive) setReflectedLoading(false); });
    return () => { alive = false; };
  }, [deliveryDate]);

  const loading = metaLoading || reflectedLoading;
  const error = metaError || reflectedError;

  function setProd(itemId: string, field: ProdField, value: string) {
    setProdQty((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  }

  function addExtraRow() {
    const name = extraName.trim();
    if (!name) return;
    setExtraRows((prev) => [
      ...prev,
      { id: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, qty: "", unit: "", note: "" },
    ]);
    setExtraName("");
  }
  function removeExtraRow(id: string) {
    setExtraRows((prev) => prev.filter((r) => r.id !== id));
  }
  function patchExtraRow(id: string, patch: Partial<ExtraRow>) {
    setExtraRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
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
  function totalFor(itemId: string): number {
    const v = valuesFor(itemId);
    return PROD_FIELDS.reduce((s, f) => s + (parseFloat(v[f.key] ?? "") || 0), 0);
  }
  function isReflected(itemId: string): boolean {
    return !!reflected[itemId] && Object.keys(reflected[itemId]).length > 0;
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
        const v = valuesFor(it.id);
        lines.push([
          csvEscape(g.category), csvEscape(it.name),
          v.SND ?? "", v.NVP ?? "", v.KCN ?? "", v.other ?? "",
          totalFor(it.id),
        ].join(","));
      }
    }
    for (const it of dept2Items) {
      const v = valuesFor(it.id);
      lines.push([
        csvEscape("แผนกอื่น"), csvEscape(it.name),
        v.SND ?? "", v.NVP ?? "", v.KCN ?? "", v.other ?? "",
        totalFor(it.id),
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
        const v = valuesFor(it.id);
        const total = totalFor(it.id);
        if (total <= 0) continue;
        pushRow(g.category, { id: it.id, name: it.name, snd: v.SND ?? "", nvp: v.NVP ?? "", kcn: v.KCN ?? "", other: v.other ?? "", total: String(total), note: "" });
      }
    }
    for (const it of dept2Items) {
      const v = valuesFor(it.id);
      const total = totalFor(it.id);
      if (total <= 0) continue;
      pushRow("แผนกอื่น", { id: it.id, name: it.name, snd: v.SND ?? "", nvp: v.NVP ?? "", kcn: v.KCN ?? "", other: v.other ?? "", total: String(total), note: "" });
    }
    for (const r of extraRows) {
      pushRow("รายการพิเศษ", { id: r.id, name: r.name, snd: "", nvp: "", kcn: "", other: r.unit || "", total: r.qty || "0", note: r.note });
    }
    return out;
  }, [mainGroups, dept2Items, extraRows, reflected, prodQty]);
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
            <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value || todayISO())} className="field" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">วันที่จัดส่งเข้าสาขา</span>
            <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value || todayISO())} className="field" />
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
                    onChange={(f, v) => setProd(it.id, f, v)}
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
                  onChange={(f, v) => setProd(it.id, f, v)}
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
          onChange={(e) => setNote(e.target.value)}
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
    </div>
    <ProductionPrintSheet
      orderDate={orderDate} deliveryDate={deliveryDate}
      printGroups={printGroups} totalCount={printTotal} note={note}
    />
    </>
  );
}
