"use client";
// M1: Stock Entry — กรอกสต็อกรายวัน/สาขา (glass, mobile-first)
// hasRemainder items = UOM (แพ็ค) + Sale Unit (เศษ g). 1 แพ็ค = item.gramsPerUOM กรัม (ตั้งหน้า Settings)
// เศษคงเหลือเกินเมื่อวานได้ (แกะกล่องใหม่) แต่ยอดรวม (แพ็ค×N + เศษ) วันนี้ ต้องไม่เกิน ของที่มี (ยกมา+รับเข้า)
//
// v2 (compact + confirm-gate): ช่อง "คงเหลือ" ทุกไอเทมเริ่มว่าง ต้องกด "✓ เท่ายกมา" หรือพิมพ์ค่าเองก่อน
// ถึงจะนับว่า "ยืนยันแล้ว" — ปุ่มบันทึกจะ disabled จริงจนกว่าจะยืนยันครบทุกรายการ (คนละเงื่อนไขกับ errorCount/variance เดิม)
import React from "react";
import Link from "next/link";
import type { Branch, Item, Meta, StockRow } from "@/lib/types";
import { displayNameFor, displayCategoryFor } from "@/lib/types";
import { remainPieces, variance, isCheckDue, weekdayFromDate } from "@/lib/calc";
import { todayISO, thaiDate } from "@/lib/fmt";
import {
  GlassCard, Badge, Button, BranchPicker, Accordion, SaveBar, PageTitle,
} from "@/components/ui";
import { useMe, useLang } from "@/components/nav";
import { TodayNextStep } from "@/components/today-next-step";
import { t } from "@/lib/i18n";

const toNum = (raw: string): number => {
  const x = parseFloat(raw);
  return Number.isFinite(x) ? x : 0;
};
const blankZero = (v: number): number | string => (v === 0 ? "" : v);

// ยอดรวมเป็นกรัม (UOM×N + เศษ) — ใช้เช็คว่าคงเหลือวันนี้ไม่เกินของที่มี
function derive(r: StockRow, N: number) {
  const availTotalG = (r.carryPack + r.inPack) * N + r.carryG + r.inG;
  const remainTotalG = r.remainPack * N + r.remainG;
  const usedTotalG = availTotalG - remainTotalG; // กรัมที่ขาย/ใช้จริงรวม
  return { availTotalG, remainTotalG, usedTotalG, overG: usedTotalG < 0 ? -usedTotalG : 0 };
}

// gpu = กรัมต่อแพ็คของรายการนั้น ใช้แปลง "กรัมที่โอนเข้า" เป็นแพ็คก่อนเข้าสมการ
const varianceOf = (r: StockRow, gpu = 0): number =>
  variance(
    r.carryPack, r.inPack, r.used, r.returned, r.remainPack,
    gpu > 0 ? Math.floor((r.transferInG ?? 0) / gpu) : 0,
    r.transferOut ?? 0,
    // แพคไม่ครบ/เกิน (ชิ้น) → แปลงเป็นแพ็คก่อน เพราะสมการนี้คิดเป็นแพ็ค
    gpu > 0 ? Math.floor((r.packAdjust ?? 0) / gpu) : 0
  );

const isFilled = (r: StockRow): boolean =>
  r.inPack > 0 || r.inG > 0 || r.remainPack !== r.carryPack || r.remainG !== r.carryG;

// กลุ่มย่อยที่ "พับเก็บไว้ก่อน" ในหมวดของมัน — ของที่ไม่ค่อยเข้า กินพื้นที่จอเปล่า ๆ (แพรขอ 2026-07-26)
// ยังกรอกได้ปกติ แค่ต้องกดเปิดก่อน · เพิ่มกลุ่มใหม่ได้โดยใส่ต่อในลิสต์นี้ ไม่ต้องแก้ที่อื่น
const COLLAPSIBLE_SUBGROUPS: { labelKey: string; match: (it: Item) => boolean }[] = [
  { labelKey: "stock.subGroupGlovesLabel", match: (it) => it.name.startsWith("Gloves YG") },
];
const subGroupOf = (it: Item): string | null =>
  COLLAPSIBLE_SUBGROUPS.find((sg) => sg.match(it))?.labelKey ?? null;

// เพดานช่อง "แพ็คเต็ม" ของรายการที่ชั่งกิโล/นับเศษ + ผลไม้ (แพรยืนยัน 2026-07-26)
// ของกลุ่มนี้ Par สูงสุด 6 แพ็ค — พิมพ์เกิน 15 คือผิดแน่นอน ไม่ใช่ของเข้าเยอะจริง
const PACK_CAP = 15;

// ขนาดถ้วยที่ใช้กรอก "ลูกค้าเอาแก้วมาเอง" — ต้องตรงกับ CupSize ในระบบเทียบยอดถ้วย
const CUP_SIZES: { size: string; label: string }[] = [
  { size: "P", label: "P (5oz)" },
  { size: "S", label: "S (9oz)" },
  { size: "BOWL", label: "Bowl" },
  { size: "14OZ", label: "14oz" },
];
const isPackCapped = (it: Item | undefined): boolean => !!it && (it.hasRemainder || !!it.remainderGroup);

// ── local compact UI (เฉพาะหน้านี้ — ห้ามแก้ shared ui kit signature) ──────────

// tag แนวตั้งเล็กๆ แทนบรรทัดคำอธิบายเต็มความกว้างเดิม (ข้อมูลที่หายไปย้ายไปไว้ใน title/tooltip)
function BlockTag({ text, title }: { text: string; title?: string }) {
  return (
    <div
      title={title}
      className="flex w-4 flex-shrink-0 items-center justify-center rounded-md bg-black/5 py-1 text-center text-[8px] font-medium leading-none text-brand-ink/45"
      style={{ writingMode: "vertical-rl" }}
    >
      {text}
    </div>
  );
}

// input ย่อส่วน (field padding/font เล็กลง) สำหรับ grid-cols-4 บังคับ
function CompactField({ label, value, onChange, readOnly, tone, maxLength, warn }: {
  label?: string; value: number | string; onChange?: (v: string) => void; readOnly?: boolean;
  tone?: "auto" | "ro" | "green"; maxLength?: number; warn?: boolean;
}) {
  const toneCls = tone === "auto" ? "bg-brand-blue/15 font-semibold text-sky-800"
    : tone === "ro" ? "bg-black/5 text-brand-ink/50"
    : tone === "green" ? "bg-ok/15 font-semibold text-ok"
    : "";
  const warnCls = warn ? "border-warn bg-warn/10 text-warn" : "";
  return (
    <label className="flex flex-col gap-0.5">
      {label && <span className="text-[8.5px] leading-tight text-brand-ink/50">{label}</span>}
      <input
        inputMode="numeric" value={value} readOnly={readOnly} maxLength={maxLength}
        onChange={(e) => onChange?.(e.target.value)}
        className={`field px-1.5 py-1 text-center text-xs ${toneCls} ${warnCls}`}
      />
    </label>
  );
}

// ช่อง "คงเหลือ" ที่ blank-until-confirmed: ยังไม่ยืนยัน → placeholder + ปุ่ม (หรือ passive "ยืนยัน?" ถ้าไม่มี onConfirm)
// ยืนยันแล้ว → input ปกติแก้ไขได้ พร้อมลิงก์ "แก้ไข" กลับไป unconfirm
function RemainCell({ label, isConfirmed, value, warn, maxLength, confirmLabel, onConfirm, onUnconfirm, onChange }: {
  label: string; isConfirmed: boolean; value: number; warn?: boolean; maxLength?: number;
  confirmLabel?: string; onConfirm?: () => void; onUnconfirm: () => void; onChange: (v: string) => void;
}) {
  const lang = useLang();
  if (!isConfirmed) {
    return (
      <label className="flex flex-col gap-0.5">
        <span className="text-[8.5px] leading-tight text-brand-ink/50">{label}</span>
        {onConfirm ? (
          <button
            type="button" onClick={onConfirm}
            className="field flex min-h-[34px] items-center justify-center border-dashed border-brand-blue/40 bg-brand-blue/10 px-1 py-1 text-center text-[9px] font-medium leading-tight text-sky-700"
          >
            {confirmLabel}
          </button>
        ) : (
          <div className="field flex min-h-[34px] items-center justify-center bg-black/[.03] px-1 py-1 text-center text-[10px] text-brand-ink/35">
            {t(lang, "stock.confirmPrompt")}
          </div>
        )}
      </label>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[8.5px] leading-tight text-brand-ink/50">{label}</span>
        <button type="button" onClick={onUnconfirm} className="text-[8.5px] text-sky-700 underline">{t(lang, "stock.editLink")}</button>
      </div>
      <input
        inputMode="numeric" value={value} maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className={`field px-1.5 py-1 text-center text-xs font-semibold ${warn ? "border-warn bg-warn/10 text-warn" : "bg-brand-blue/15 text-sky-800"}`}
      />
    </div>
  );
}

export default function StockPage() {
  const me = useMe();
  const lang = useLang();
  const scoped = !!me && me.branchScope !== "all";
  const [branch, setBranch] = React.useState<Branch>("NVP");
  const [date, setDate] = React.useState<string>(todayISO());
  // โชว์ prompt ชวนไปกรอกยอดขายหลังบันทึกสต็อกสำเร็จ
  const [showSavePrompt, setShowSavePrompt] = React.useState(false);

  // ผู้ใช้ที่มีสิทธิ์สาขาเดียว → ล็อกสาขาให้ตรงสิทธิ์
  React.useEffect(() => {
    if (scoped) setBranch(me!.branchScope as Branch);
  }, [scoped, me]);
  const [meta, setMeta] = React.useState<Meta | null>(null);
  // กรัมต่อแพ็ค — ใช้แปลง "กรัมที่โอนเข้า" เป็นแพ็คตอนคิดยอดตรง/ไม่ตรง (v1.17)
  const gpuOf = React.useCallback(
    (itemId: string) => meta?.items.find((i) => i.id === itemId)?.gramsPerUOM ?? 0,
    [meta]
  );
  const [rows, setRows] = React.useState<Record<string, StockRow>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // ลายเซ็นเวลาของข้อมูลชุดที่โหลดมา — ส่งกลับตอนบันทึกเพื่อให้เซิร์ฟเวอร์รู้ว่ามีคนแทรกไหม (v1.14)
  const [baseSavedAt, setBaseSavedAt] = React.useState<string | null>(null);
  // ยืนยันแล้วหรือยัง ต่อไอเทม (reset ทุกครั้งที่เปลี่ยนสาขา/วันที่ = รอบใหม่)
  const [confirmed, setConfirmed] = React.useState<Record<string, boolean>>({});
  // เปิด/ปิด panel "ส่งคืน/เสีย" ต่อไอเทม (default ปิด เว้นแต่มีค่า returned ติดมา)
  const [returnOpen, setReturnOpen] = React.useState<Record<string, boolean>>({});

  // v1.9: เตือนถ้ายังมีรายการยืนยันรับของค้างอยู่ — พนักงานเข้าหน้านี้ทุกวันอยู่แล้ว ต้องเห็นแน่นอน
  const [receiptPending, setReceiptPending] = React.useState(false);
  React.useEffect(() => {
    fetch(`/api/confirm-receipt/pending-count?branch=${branch}`)
      .then((r) => (r.ok ? r.json() : { hasPending: false }))
      .then((d) => setReceiptPending(!!d.hasPending))
      .catch(() => {});
  }, [branch]);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/meta")
      .then((r) => r.json())
      .then((m: Meta) => { if (alive) setMeta(m); })
      .catch((e) => { if (alive) setErr(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    setConfirmed({}); // ล้างสถานะเก่าไว้ก่อนระหว่างโหลด (กันโชว์ค้างจากสาขา/วันที่ก่อนหน้า)
    setReturnOpen({});
    fetch(`/api/stock?branch=${branch}&date=${date}`)
      .then((r) => r.json())
      .then((data: {
        rows?: StockRow[]; error?: string; savedAt?: string | null;
        ownCups?: { size: string; ownCup: number }[];
      }) => {
        if (!alive) return;
        if (data.error) { setErr(data.error); return; }
        setBaseSavedAt(data.savedAt ?? null);
        const oc = Object.fromEntries((data.ownCups ?? []).map((c) => [c.size, c.ownCup]));
        setOwnCups(oc);
        setOwnCupOpen(Object.values(oc).some((v) => Number(v) > 0));
        const map: Record<string, StockRow> = {};
        const conf: Record<string, boolean> = {};
        for (const row of data.rows ?? []) {
          map[row.itemId] = row;
          // แถวที่มีบันทึกจริงของวันนี้แล้ว (ไม่ว่าค่าจะเท่ายกมาหรือไม่ — เช่นกด "✓ เท่ายกมา" ไปแล้ว)
          // ให้เริ่มเป็น "ยืนยันแล้ว" ทันที กันไม่ให้เปิดหน้าซ้ำแล้วดูเหมือนยังไม่กรอก
          if (row.hasEntry) conf[row.itemId] = true;
        }
        setRows(map);
        setConfirmed(conf);
      })
      .catch((e) => { if (alive) setErr(String(e?.message ?? e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [branch, date]);

  const weekday = React.useMemo(() => weekdayFromDate(date), [date]);

  const groups = React.useMemo(() => {
    if (!meta) return [] as { category: string; items: Item[] }[];
    const shown = meta.items
      // แสดงเฉพาะรายการที่ stock ในสาขานี้ (par != null) + ถึงรอบเช็ควันนี้ (daily/จันทร์+พฤหัส)
      // 2026-07-26: เลิกบังคับโชว์ "ทุกสมาชิกกลุ่มเศษรวม" แล้ว — ไซซ์ที่ไม่ได้เข้าจริง (Blueberry 125g/500g,
      // Strawberry 500g) ตั้ง par เป็น null ไปแล้ว จึงหายไปเอง เหลือแต่ไซซ์หลักที่ถือเศษกรัมของทั้งกลุ่ม
      .filter((it) => meta.par[it.id]?.[branch] != null && isCheckDue(it.checkFrequency, weekday))
      .sort((a, b) => a.sort - b.sort);
    const out: { category: string; items: Item[] }[] = [];
    for (const it of shown) {
      // เฉพาะ NCD — บางรายการย้ายไปโชว์ในหมวด "To-Go" แทนหมวดปกติ (ไม่กระทบสาขาอื่น ดู displayCategoryFor)
      const cat = displayCategoryFor(it, branch);
      let g = out.find((x) => x.category === cat);
      if (!g) { g = { category: cat, items: [] }; out.push(g); }
      g.items.push(it);
    }
    return out;
  }, [meta, branch, weekday]);

  const shownItems = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const total = shownItems.length;

  // รายการที่ไม่ถึงรอบเช็ควันนี้ (checkFrequency=monThu แต่วันนี้ไม่ใช่จันทร์/พฤหัส) — ซ่อนไว้เป็นค่าเริ่มต้น
  // แต่ของอาจเข้าสาขาวันไหนก็ได้ (ไม่ผูกกับรอบเช็ค) เลยต้องมีทางกดดู/กรอกได้เผื่อมีของเข้าวันที่ไม่ตรงรอบ
  // ลูกค้าเอาแก้วมาเอง — เก็บเป็น map ตามขนาด กรอกในหมวดถ้วย บันทึกไปพร้อมปุ่มบันทึกสต็อก
  const [ownCups, setOwnCups] = React.useState<Record<string, number>>({});
  const [ownCupOpen, setOwnCupOpen] = React.useState(false);
  // แพคถ้วยมีของไม่ตรงจำนวน — ยุบไว้เหมือนกล่องอื่น ๆ ที่เป็นเคสนาน ๆ ที
  // กางเองถ้าวันนั้นมีค่าบันทึกไว้แล้ว ไม่งั้นค่าที่กรอกไปจะถูกซ่อนจนไม่มีใครรู้ว่ามี
  const [packAdjOpen, setPackAdjOpen] = React.useState(false);

  // ด่านยืนยันวันที่/สาขา ก่อนเข้าหน้ากรอกจริง (แพรขอ 2026-07-26)
  // เดิมเปิดหน้ามาก็โชว์ข้อมูลวันนี้เลย ทำให้เผลอกรอกผิดวัน/ผิดสาขาโดยไม่ทันดู
  // ** ต้องประกาศก่อน effect ที่ใช้ started เป็น dependency ด้านล่าง ** (const มี TDZ)
  const [started, setStarted] = React.useState(false);

  // ใบเติมของที่ยังยืนยันรับไม่ครบ — เตือนก่อนเริ่มนับสต็อก (v1.20)
  // ถ้ายังไม่ยืนยัน ช่อง "รับเข้า" จะว่าง แล้วคงเหลือที่นับได้จะดูเหมือนเกินยกมา = ตัวเลขเพี้ยนทั้งใบ
  const [pendingSheets, setPendingSheets] = React.useState<{ date: string; pendingCount: number }[]>([]);
  React.useEffect(() => {
    fetch(`/api/confirm-receipt/sheets?branch=${branch}`)
      .then((r) => (r.ok ? r.json() : { sheets: [] }))
      .then((d) => setPendingSheets(d.sheets ?? []))
      .catch(() => setPendingSheets([]));
  }, [branch, started]);

  // แยก "ใบของวันที่กำลังจะนับ" ออกจาก "ใบเก่าค้าง" — ความเร่งด่วนคนละเรื่องกัน
  // ใบของวันนั้นไม่ยืนยัน = ตัวเลขวันนั้นผิดแน่ ๆ ต้องทำก่อน
  // ใบเก่าค้าง = ต้องตัดสินใจว่าของมาไหม (ยืนยัน หรือติ๊กไม่ได้รับ) ไม่ใช่แค่กดยืนยันรัว ๆ
  const pendingToday = pendingSheets
    .filter((x) => x.date === date)
    .reduce((sum, x) => sum + x.pendingCount, 0);
  const oldSheets = pendingSheets.filter((x) => x.date < date && x.pendingCount > 0);
  const pendingOld = oldSheets.reduce((sum, x) => sum + x.pendingCount, 0);
  const oldestPendingDate = oldSheets.map((x) => x.date).sort()[0];
  const [showHidden, setShowHidden] = React.useState(false);
  // กดแสดงแล้วเลื่อนไปหาให้เลย — หมวดที่ซ่อนอยู่ท้ายสุดของทุกหมวด ถ้าไม่เลื่อนให้จะหาไม่เจอ
  React.useEffect(() => {
    if (!showHidden) return;
    const timer = setTimeout(
      () => document.getElementById("hidden-start")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      60
    );
    return () => clearTimeout(timer);
  }, [showHidden]);
  // กลุ่มย่อยที่พับไว้ (เช่น ถุงมือ) — key = "หมวด|ชื่อกลุ่ม" กันชนกันข้ามหมวด
  const [openSub, setOpenSub] = React.useState<Record<string, boolean>>({});
  const hiddenGroups = React.useMemo(() => {
    if (!meta) return [] as { category: string; items: Item[] }[];
    const shown = meta.items
      .filter((it) => meta.par[it.id]?.[branch] != null && !isCheckDue(it.checkFrequency, weekday))
      .sort((a, b) => a.sort - b.sort);
    const out: { category: string; items: Item[] }[] = [];
    for (const it of shown) {
      // เฉพาะ NCD — บางรายการย้ายไปโชว์ในหมวด "To-Go" แทนหมวดปกติ (ไม่กระทบสาขาอื่น ดู displayCategoryFor)
      const cat = displayCategoryFor(it, branch);
      let g = out.find((x) => x.category === cat);
      if (!g) { g = { category: cat, items: [] }; out.push(g); }
      g.items.push(it);
    }
    return out;
  }, [meta, branch, weekday]);
  const hiddenTodayCount = React.useMemo(() => hiddenGroups.reduce((s, g) => s + g.items.length, 0), [hiddenGroups]);
  // หมวดที่มาจาก hiddenGroups (ไม่ถึงรอบเช็ค) — ใช้แยก badge ตอน render (ไม่มีหมวดไหนซ้อนกับ groups ปกติอยู่แล้ว)
  const hiddenCategorySet = React.useMemo(() => new Set(hiddenGroups.map((g) => g.category)), [hiddenGroups]);
  const displayGroups = React.useMemo(
    () => (showHidden ? [...groups, ...hiddenGroups] : groups),
    [showHidden, groups, hiddenGroups]
  );

  const itemById = React.useMemo(
    () => new Map((meta?.items ?? []).map((it) => [it.id, it] as const)),
    [meta],
  );
  // กลุ่มเศษรวม → รายชื่อ item id (เรียงตาม sort) ที่ stock ในสาขานี้
  const groupIds = React.useMemo(() => {
    const m = new Map<string, string[]>();
    if (!meta) return m;
    // เอาเฉพาะสมาชิกที่ stock จริงในสาขานี้ — "ตัวหลัก" (leader ที่ถือเศษกรัมของทั้งกลุ่ม) = ids[0]
    // ถ้ายังรวมไซซ์ที่ par=null อยู่ leader จะกลายเป็นไซซ์ที่ถูกซ่อน แล้วช่องกรอกเศษกรัมจะหายไปทั้งกลุ่ม
    const gs = meta.items
      .filter((it) => it.remainderGroup && meta.par[it.id]?.[branch] != null)
      .sort((a, b) => a.sort - b.sort);
    for (const it of gs) {
      const g = it.remainderGroup!;
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(it.id);
    }
    return m;
  }, [meta, branch]);

  // ยอดรวมของกลุ่ม (กรัม): Σ(คงเหลือกล่อง×ขนาด) + เศษรวม(ที่ leader) ≤ ของที่มี
  const groupTotals = React.useCallback((groupName: string) => {
    const ids = groupIds.get(groupName) ?? [];
    const leaderId = ids[0];
    let availG = 0, remainG = 0;
    for (const id of ids) {
      const it = itemById.get(id); const r = rows[id];
      if (!it || !r) continue;
      availG += (r.carryPack + r.inPack) * it.gramsPerUOM;
      remainG += r.remainPack * it.gramsPerUOM;
    }
    const lr = rows[leaderId];
    if (lr) { availG += lr.carryG + lr.inG; remainG += lr.remainG; }
    const usedG = availG - remainG;
    return { leaderId, availG, remainG, usedG, overG: usedG < 0 ? -usedG : 0 };
  }, [groupIds, itemById, rows]);

  // ไอเทมถ้วยทั้งหมด (ใช้จับคู่ขนาด → itemId ตอนกรอกส่วนต่างแพค)
  const cupItems = React.useMemo(
    () => (meta?.items ?? []).filter((it) => it.isCup),
    [meta]
  );

  // CUP/ถ้วย: ผลรวม "ใช้/ขาย" (ชิ้น) ของทุกไอเทม isCup ต่อ category — โชว์เป็น banner บน accordion
  const cupSummaryByCategory = React.useMemo(() => {
    const map = new Map<string, { count: number; totalUsed: number }>();
    for (const it of shownItems) {
      if (!it.isCup) continue;
      const r = rows[it.id];
      if (!r) continue;
      const d = derive(r, it.gramsPerUOM);
      const cur = map.get(it.category) ?? { count: 0, totalUsed: 0 };
      cur.count += 1;
      // ปัดติดลบเป็น 0 ก่อนรวม (แพรชี้ 2026-08-12) — รายการที่คงเหลือเกินของที่มี (ค่าที่ผิดอยู่แล้ว
      // มีป้ายเตือนแดงแยกต่างหาก) เคยลาก usedTotalG ติดลบมาหักยอดรวมทั้งบาน ทำให้ไม่ตรงกับหน้า "ถ้วย"
      // (cupReconcile ใน calc.ts ปัดติดลบเป็น 0 ต่อรายการอยู่แล้ว) — ไม่แตะ d.usedTotalG/overG ตรงๆ
      // เพราะยังใช้คำนวณป้ายเตือน "เกิน" อยู่ที่อื่นในไฟล์นี้
      cur.totalUsed += Math.max(d.usedTotalG, 0);
      map.set(it.category, cur);
    }
    return map;
  }, [shownItems, rows]);

  // นับ ยืนยันแล้ว (จาก confirmed map) + ค้างยืนยัน + รายการที่เกิน (คงเหลือรวมเกินของที่มี / variance / กลุ่มเกิน)
  // errorItems เก็บ "ชื่อ + เกินเท่าไหร่" ไว้โชว์ใน popup ตอนกดบันทึก (แพรขอ 2026-07-26) — เดิมบอกแค่จำนวนรายการ ต้องไล่หาเองทีละอัน
  const { filledCount, errorCount, unconfirmedCount, errorItems } = React.useMemo(() => {
    let filled = 0, unconfirmed = 0;
    const errs: string[] = [];
    for (const it of shownItems) {
      const r = rows[it.id];
      if (!r) continue;
      if (confirmed[it.id]) filled++; else unconfirmed++;
      if (it.remainderGroup) continue; // กลุ่มเช็คแยกด้านล่าง
      if (it.hasRemainder) {
        const d = derive(r, it.gramsPerUOM);
        if (d.usedTotalG < 0) {
          errs.push(t(lang, "stock.errorItemOverQty", {
            name: it.name, n: d.overG, unit: it.isCup ? t(lang, "stock.unitPiece") : "g",
          }));
        }
      } else {
        const v = varianceOf(r, it.gramsPerUOM);
        if (v !== 0) {
          errs.push(t(lang, "stock.errorItemVarianceMismatch", { name: it.name, sign: v > 0 ? "+" : "", n: v }));
        }
      }
    }
    for (const [g] of groupIds) {
      const overG = groupTotals(g).overG;
      if (overG > 0) errs.push(t(lang, "stock.errorGroupOver", { group: g, n: overG }));
    }
    return { filledCount: filled, errorCount: errs.length, unconfirmedCount: unconfirmed, errorItems: errs };
  }, [shownItems, rows, groupIds, groupTotals, confirmed, lang]);

  type NumField = "inPack" | "used" | "remainPack" | "returned" | "inG" | "usedG" | "remainG" | "returnedG";
  // คงเหลือแพ็ค = ยกมา + รับเข้า − ออก/ขาย − ส่งคืน/เสีย (ส่งคืนหักจากยอด stock)
  const calcRemainPack = (r: StockRow) => Math.max(r.carryPack + r.inPack - r.used - r.returned, 0);
  const PACK_FIELDS = new Set<NumField>(["inPack", "used", "remainPack", "returned"]);
  function setField(itemId: string, field: NumField, raw: string, N: number) {
    setRows((prev) => {
      const cur = prev[itemId];
      if (!cur) return prev;
      let val = toNum(raw);
      // จำกัดช่อง "แพ็คเต็ม" ไม่เกิน 15 เฉพาะของชั่งกิโล/นับเศษ + ผลไม้ (แพรยืนยัน 2026-07-26)
      // กลุ่มนี้ Par สูงสุดแค่ 6 แพ็ค เกิน 15 คือพิมพ์ผิดแน่นอน (เคสจริง: Blueberry 500g โดนพิมพ์ 243)
      // ของอื่น (Shake Par 80-100, ถุงกระดาษ Par 40, ฟอยล์แก้ว Par 30) ไม่จำกัด เพราะเข้าเยอะจริง
      if (PACK_FIELDS.has(field) && isPackCapped(itemById.get(itemId))) {
        val = Math.min(val, PACK_CAP);
      }
      const next: StockRow = { ...cur };
      switch (field) {
        case "inPack": // รับเข้า (แพ็ค) → คงเหลือแพ็ค ปรับตาม
          next.inPack = val;
          next.remainPack = calcRemainPack(next);
          break;
        case "used": // ออก/ขาย (แพ็ค) → คำนวณคงเหลือแพ็ค
          next.used = val;
          next.remainPack = calcRemainPack(next);
          break;
        case "returned": // ส่งคืน/เสีย (แพ็ค) → หักจากคงเหลือ
          next.returned = val;
          next.remainPack = calcRemainPack(next);
          break;
        case "remainPack": // คงเหลือแพ็ค → คำนวณ ออก/ขาย ย้อนกลับ (คงค่าส่งคืน)
          next.remainPack = val;
          next.used = Math.max(next.carryPack + next.inPack - next.returned - val, 0);
          break;
        case "inG": // รับเข้า g (เศษ) → คงเหลือ g เพิ่มตาม
          next.remainG = Math.max(next.remainG + (val - next.inG), 0);
          next.inG = val;
          break;
        case "usedG": { // ขาย/ใช้ g รวม → คำนวณคงเหลือ g (รวมกล่องที่แกะ)
          // ต้องหัก returnedG (ส่งคืน/เสียเป็นกรัม) ออกด้วย ไม่งั้นแก้ "ขาย/ใช้" ทีหลังจะไปเขียนทับ
          // ค่าที่ถูกหักไปแล้วจากการกรอก "ส่งคืนเศษ" ก่อนหน้า ทำให้ยอดส่งคืนหายไปจาก remainG เงียบๆ
          const openedG = Math.max(next.carryPack + next.inPack - next.remainPack, 0) * N;
          const availForSale = next.carryG + next.inG + openedG;
          next.remainG = Math.max(availForSale - val - (next.returnedG ?? 0), 0);
          break;
        }
        case "remainG": // คงเหลือ g (เศษ) → กรอกอิสระ (เกิน carryG ได้ = แกะกล่องใหม่)
          next.remainG = val;
          break;
        case "returnedG": // ส่งคืนเศษ (g) → หักจากคงเหลือ g ทันที (เฉพาะ leader กลุ่มเศษรวม)
          next.remainG = Math.max(next.remainG - (val - (next.returnedG ?? 0)), 0);
          next.returnedG = val;
          break;
      }
      next.variance = varianceOf(next, gpuOf(itemId));
      return { ...prev, [itemId]: next };
    });
    // พิมพ์ค่าใดๆ ในไอเทมนี้ = ถือว่ายืนยันแล้ว (ไม่ต้องกดปุ่ม "✓ เท่ายกมา" ซ้ำ)
    setConfirmed((prev) => (prev[itemId] ? prev : { ...prev, [itemId]: true }));
  }

  // แพคมีของไม่ตรงจำนวน (แพรขอ 2026-07-29) — กรอกเป็นส่วนต่างชิ้น +2 / -1
  // เก็บแยกจากช่องรับเข้า เพื่อให้ย้อนดูได้ว่าของที่เกินมาไม่ใช่ของที่สั่ง
  function setPackAdjust(itemId: string, raw: string) {
    const val = Math.max(-20, Math.min(20, Math.trunc(Number(raw) || 0)));
    setRows((prev) => {
      const cur = prev[itemId];
      if (!cur) return prev;
      return { ...prev, [itemId]: { ...cur, packAdjust: val } };
    });
    setConfirmed((prev) => (prev[itemId] ? prev : { ...prev, [itemId]: true }));
  }

  function setNote(itemId: string, note: string) {
    setRows((prev) => {
      const cur = prev[itemId];
      if (!cur) return prev;
      return { ...prev, [itemId]: { ...cur, note } };
    });
  }

  // ปุ่ม "✓ เท่ายกมา" — เติม remainPack=carryPack (และ remainG=carryG ถ้าไอเทมนี้มีช่องเศษ) แล้วมาร์คยืนยัน
  function confirmItem(itemId: string, hasG: boolean) {
    setRows((prev) => {
      const cur = prev[itemId];
      if (!cur) return prev;
      const next: StockRow = { ...cur, remainPack: cur.carryPack };
      if (hasG) next.remainG = cur.carryG;
      next.used = Math.max(next.carryPack + next.inPack - next.returned - next.remainPack, 0);
      next.variance = varianceOf(next, gpuOf(itemId));
      return { ...prev, [itemId]: next };
    });
    setConfirmed((prev) => ({ ...prev, [itemId]: true }));
  }

  // ลิงก์ "แก้ไข" — กลับไปสถานะยังไม่ยืนยัน (ซ่อนช่องคงเหลือกลับไปเป็น placeholder+ปุ่มอีกครั้ง)
  function unconfirmItem(itemId: string) {
    setConfirmed((prev) => ({ ...prev, [itemId]: false }));
  }

  async function handleSave() {
    if (unconfirmedCount > 0) return; // save gate: ต้องยืนยันครบทุกรายการก่อน (ปุ่มถูก disabled อยู่แล้ว กันไว้อีกชั้น)
    if (errorCount > 0) {
      // โชว์ชื่อรายการที่มีปัญหาให้ครบ (จำกัด 15 บรรทัดกัน popup ยาวเกินจอมือถือ) จะได้กลับไปแก้ถูกตัว
      const shown = errorItems.slice(0, 15).map((s) => `• ${s}`).join("\n");
      const more = errorItems.length > 15
        ? `\n${t(lang, "stock.saveErrorMoreItems", { n: errorItems.length - 15 })}`
        : "";
      const ok = window.confirm(
        `${t(lang, "stock.saveErrorConfirmPrefix", { n: errorCount })}\n\n${shown}${more}\n\n${t(lang, "stock.saveErrorConfirmSuffix")}`
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      // ส่งทุกรายการที่ "ยืนยันแล้ว" ไม่ใช่แค่รายการที่ถึงรอบเช็ค — กันเคสของเข้าวันที่ไม่ตรงรอบ
      // (ปุ่มบันทึก disabled จนกว่ารายการที่ถึงรอบจะยืนยันครบ ส่วนรายการที่ซ่อนไว้แล้วกดกรอกเพิ่ม จะยืนยันแล้วก็ส่งไปด้วย)
      const payload = (meta?.items ?? [])
        .filter((it) => confirmed[it.id])
        .map((it) => rows[it.id])
        .filter(Boolean)
        .map((r) => ({ ...r, variance: varianceOf(r, gpuOf(r.itemId)) }));
      const post = (force: boolean) => fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch, date, rows: payload, baseSavedAt, force,
          ownCups: CUP_SIZES.map((cs) => ({ size: cs.size, ownCup: ownCups[cs.size] ?? 0 })),
        }),
      });
      let res = await post(false);
      let data = (await res.json()) as {
        updated?: number; inserted?: number; error?: string;
        conflict?: boolean; savedBy?: string | null; savedAt?: string | null;
      };

      // มีคนบันทึกแทรกหลังจากเราเปิดหน้านี้ — ให้เลือกเอง ไม่ทับเงียบ ๆ และไม่ทิ้งที่กรอกไว้เอง
      if (res.status === 409 && data.conflict) {
        const who = data.savedBy ?? t(lang, "stock.conflictOtherPerson");
        const when = data.savedAt ? new Date(data.savedAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "";
        const overwrite = window.confirm(
          `${t(lang, "stock.conflictSavedBy", { who })}${when ? t(lang, "stock.conflictSavedAtSuffix", { time: when }) : ""}\n\n` +
          t(lang, "stock.conflictConfirmBody", { who })
        );
        if (!overwrite) {
          window.alert(t(lang, "stock.conflictCancelAlert"));
          return;
        }
        res = await post(true);
        data = await res.json();
      }

      if (!res.ok || data.error) throw new Error(data.error ?? t(lang, "stock.saveFailedGeneric"));
      setBaseSavedAt(data.savedAt ?? null); // กันเด้งเตือนซ้ำถ้ากดบันทึกอีกรอบโดยไม่ได้ออกจากหน้า
      setShowSavePrompt(true); // แทน alert เดิม — ชวนไปกรอกยอดขายต่อ
    } catch (e: any) {
      window.alert(t(lang, "stock.saveFailedPrefix", { msg: e?.message ?? e }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-24">
      <PageTitle title={t(lang, "stock.pageTitle")} right={<Badge tone="blue">{thaiDate(date)}</Badge>} />

      {/* สาขา + วันที่ อยู่บรรทัดเดียวกัน (แพรขอ 2026-07-29) — พนักงานทำงานบนมือถือ ทุกบรรทัดที่ตัดได้คือการเลื่อนที่หายไป */}
      <div className="glass mb-2.5 p-2.5">
        <div className="grid gap-2">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <BranchPicker
                value={branch}
                onChange={(b) => { setBranch(b); setStarted(false); }}
                locked={scoped}
              />
            </div>
            <input
              type="date" value={date}
              onChange={(e) => { setDate(e.target.value); setStarted(false); }}
              className="field w-[122px] shrink-0 px-2 py-2 text-[12.5px]"
            />
          </div>
          {date !== todayISO() && (
            <span className="text-[11px] font-medium text-warn">{t(lang, "stock.notToday", { date: thaiDate(date) })}</span>
          )}
          {!started && (
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="w-full rounded-xl bg-brand-red px-4 py-2.5 text-[15px] font-semibold text-white shadow-glass"
            >
              {t(lang, "stock.startButton")}
            </button>
          )}
        </div>
      </div>

      {!started && pendingToday > 0 && (
        <div className="mb-3 rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-3">
          <p className="text-[13.5px] font-semibold text-warn">
            {t(lang, "stock.receiptPendingTodayTitle")}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-brand-ink/60">
            {t(lang, "stock.receiptPendingTodayBody", { n: pendingToday })}
          </p>
          <Link
            href={`/confirm-receipt?branch=${branch}`}
            className="mt-2.5 block rounded-xl bg-brand-red px-4 py-2.5 text-center text-[13px] font-semibold text-white"
          >
            {t(lang, "stock.goConfirmReceipt")}
          </Link>
        </div>
      )}

      {!started && pendingOld > 0 && (
        <div className="mb-3 rounded-xl border border-black/10 bg-white/70 px-3.5 py-3">
          <p className="text-[12.5px] font-medium">
            {t(lang, "stock.oldPendingSheets", { n: pendingOld })}
            {oldestPendingDate ? t(lang, "stock.oldestPendingSuffix", { date: thaiDate(oldestPendingDate) }) : ""}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-brand-ink/55">
            {t(lang, "stock.oldPendingBody")}
            <br />
            <span className="text-brand-ink/45">
              {t(lang, "stock.oldPendingSub")}
            </span>
          </p>
          <Link
            href={`/confirm-receipt?branch=${branch}`}
            className="mt-2 inline-block text-[12.5px] font-medium text-brand-red underline underline-offset-2"
          >
            {t(lang, "stock.goManagePending")}
          </Link>
        </div>
      )}

      {!started && (
        <GlassCard>
          <p className="py-6 text-center text-sm leading-relaxed text-brand-ink/50">
            {t(lang, "stock.preStartHintLine1")}<br />
            {t(lang, "stock.preStartHintLine2")}
          </p>
        </GlassCard>
      )}

      {started && (<>

      {receiptPending && (
        <Link
          href={`/confirm-receipt?branch=${branch}`}
          className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2.5 text-sm text-brand-ink/80"
        >
          <span>{t(lang, "stock.receiptPendingBanner")}</span>
          <span className="shrink-0 font-semibold text-warn underline underline-offset-2">{t(lang, "stock.goConfirmReceiptShort")}</span>
        </Link>
      )}

      {/* สรุปหัวหน้าเป็นบรรทัดเดียวแทนการ์ด 3 ใบ — ตัวเลขชุดเดิมทั้งหมด แค่กินที่น้อยลง (แพรขอ 2026-07-29) */}
      <div className="mb-2.5 flex items-center gap-3 rounded-xl border border-black/[.06] bg-white/70 px-3 py-2 text-[12px] text-brand-ink/55">
        <span>
          {t(lang, "stock.confirmedCountLabel")}{" "}
          <b className={`text-[14px] tabular-nums ${total > 0 && filledCount === total ? "text-ok" : "text-brand-ink"}`}>
            {filledCount}/{total}
          </b>
        </span>
        <span>
          {t(lang, "stock.pendingCountLabel")}{" "}
          <b className={`text-[14px] tabular-nums ${unconfirmedCount > 0 ? "text-warn" : "text-ok"}`}>{unconfirmedCount}</b>
        </span>
        {errorCount > 0 && (
          <span className="ml-auto font-semibold text-warn">{t(lang, "stock.errorCountLabel", { n: errorCount })}</span>
        )}
      </div>

      {hiddenTodayCount > 0 && (
        <button
          type="button"
          onClick={() => setShowHidden((v) => !v)}
          className="mb-3 flex w-full items-center justify-between gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2.5 text-left text-sm text-brand-ink/70"
        >
          <span>
            {showHidden
              ? t(lang, "stock.hiddenShownBanner", { n: hiddenTodayCount })
              : t(lang, "stock.hiddenHiddenBanner", { n: hiddenTodayCount })}
          </span>
          <span className="shrink-0 font-semibold text-sky-700 underline underline-offset-2">
            {showHidden ? t(lang, "stock.hideAction") : t(lang, "stock.showListAction")}
          </span>
        </button>
      )}

      {err && (
        <GlassCard className="mb-3">
          <p className="text-sm text-warn">{t(lang, "stock.loadErrorPrefix", { err })}</p>
        </GlassCard>
      )}

      {loading ? (
        <GlassCard><p className="text-sm text-brand-ink/50">{t(lang, "common.loading")}</p></GlassCard>
      ) : groups.length === 0 ? (
        <GlassCard><p className="text-sm text-brand-ink/50">{t(lang, "stock.emptyForBranch")}</p></GlassCard>
      ) : (
        displayGroups.map((g, gi) => {
          const cupSum = cupSummaryByCategory.get(g.category);
          const isHiddenGroup = hiddenCategorySet.has(g.category);
          const categoryIncomplete = !isHiddenGroup && g.items.some((it) => rows[it.id] && !confirmed[it.id]);
          // แยกรายการที่อยู่ในกลุ่มย่อยพับเก็บ (เช่น ถุงมือ) ออกไปต่อท้ายหมวด — เปิดดู/กรอกได้เมื่อกด
          const subBuckets = new Map<string, Item[]>();
          const mainItems: Item[] = [];
          for (const it of g.items) {
            const sg = subGroupOf(it);
            if (!sg) { mainItems.push(it); continue; }
            const cur = subBuckets.get(sg) ?? [];
            cur.push(it);
            subBuckets.set(sg, cur);
          }
          // ลำดับที่ render: รายการปกติ → หัวข้อกลุ่มพับ → (ถ้ากดเปิด) รายการในกลุ่มนั้น ต่อท้ายหัวข้อทันที
          type RowEntry =
            | { kind: "item"; item: Item }
            | { kind: "toggle"; labelKey: string; items: Item[] };
          const rowEntries: RowEntry[] = [
            ...mainItems.map((item) => ({ kind: "item", item }) as RowEntry),
            ...Array.from(subBuckets.entries()).flatMap(([labelKey, items]) => [
              { kind: "toggle", labelKey, items } as RowEntry,
              ...(openSub[`${g.category}|${labelKey}`]
                ? items.map((item) => ({ kind: "item", item }) as RowEntry)
                : []),
            ]),
          ];
          const isFirstHidden = isHiddenGroup && hiddenGroups[0]?.category === g.category;
          return (
            <React.Fragment key={g.category}>
            {isFirstHidden && (
              <div id="hidden-start" className="mb-2 mt-1 px-1 text-[11px] font-medium text-ok">
                {t(lang, "stock.hiddenStartMarker")}
              </div>
            )}
            <Accordion
              title={
                <span className="flex items-center gap-1.5">
                  {g.category}
                  {isHiddenGroup ? (
                    <span className="rounded-full bg-ok/15 px-1.5 py-0.5 text-[10px] font-semibold text-ok">
                      {t(lang, "stock.hiddenCategoryBadge")}
                    </span>
                  ) : categoryIncomplete && (
                    <span className="rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                      {t(lang, "stock.incompleteCategoryBadge")}
                    </span>
                  )}
                </span>
              }
              count={t(lang, "stock.itemCountSuffix", { n: g.items.length })}
              defaultOpen={gi === 0 || isHiddenGroup}
            >
              <div className="grid gap-1 py-0.5">
                {rowEntries.map((e) => {
                  if (e.kind === "toggle") {
                    const key = `${g.category}|${e.labelKey}`;
                    const open = !!openSub[key];
                    const pending = e.items.filter((x) => rows[x.id] && !confirmed[x.id]).length;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setOpenSub((s) => ({ ...s, [key]: !s[key] }))}
                        className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-black/15 bg-black/[.02] px-2.5 py-2 text-left"
                      >
                        <span className="flex items-center gap-1.5 text-xs font-medium text-brand-ink/70">
                          <span className={`inline-block text-[10px] transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
                          {t(lang, e.labelKey)} {t(lang, "stock.itemCountSuffix", { n: e.items.length })}
                        </span>
                        {!open && pending > 0 && (
                          <span className="rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                            {t(lang, "stock.subGroupNotFilled", { n: pending })}
                          </span>
                        )}
                      </button>
                    );
                  }
                  const it = e.item;
                  const row = rows[it.id];
                  if (!row) return null;
                  const N = it.gramsPerUOM;
                  const d = derive(row, N);
                  const filled = isFilled(row);
                  const v = varianceOf(row, it.gramsPerUOM);
                  const su = it.isCup ? t(lang, "stock.unitPiece") : "g"; // หน่วยย่อย: ถ้วยนับชิ้น · อื่นเป็นกรัม
                  const grp = it.remainderGroup;
                  const isLeader = !!grp && groupIds.get(grp)?.[0] === it.id;
                  const gt = grp ? groupTotals(grp) : null;
                  const leaderName = gt ? itemById.get(gt.leaderId)?.name ?? "" : "";
                  const par = meta?.par[it.id]?.[branch] ?? null;
                  const isConfirmed = !!confirmed[it.id];

                  // จำกัดช่องแพ็ค ≤15 เฉพาะไอเทม hasRemainder === true (กันสลับกับช่องกรัม) — ไม่แตะบล็อกกรัม/กลุ่ม
                  const packLimited = isPackCapped(it);
                  const inPackWarn = packLimited && row.inPack > 15;
                  const usedWarn = packLimited && row.used > 15;
                  const remainPackWarn = packLimited && row.remainPack > 15;
                  const anyPackWarn = inPackWarn || usedWarn || remainPackWarn;

                  // ไอเทมนี้มีช่องเศษ (g) ที่ต้องยืนยันคู่กับ pack ไหม (leader กลุ่ม หรือ hasRemainder เดี่ยว)
                  const hasGField = it.hasRemainder || (!!grp && isLeader);
                  const confirmLabel = hasGField
                    ? t(lang, "stock.confirmedToCarryWithG", { pack: row.carryPack, g: row.carryG, unit: su })
                    : t(lang, "stock.confirmedToCarry", { pack: row.carryPack });

                  const returnedExpanded = returnOpen[it.id] ?? (row.returned > 0 || (row.returnedG ?? 0) > 0);
                  // บรรทัด "โอนภายใน" — โผล่เฉพาะแถวที่มีการแกะจริงในวันนั้น (v1.17)
                  // ระบบเขียนเอง อ่านอย่างเดียว · แถวอื่นอีกร้อยกว่ารายการหน้าตาเหมือนเดิม
                  const xferOut = row.transferOut ?? 0;
                  const xferInG = row.transferInG ?? 0;
                  const xferToName = it.expiryConvertToItemId
                    ? meta?.items.find((x) => x.id === it.expiryConvertToItemId)?.name
                    : undefined;
                  const xferFromName = xferInG > 0
                    ? meta?.items.find((x) => x.expiryConvertToItemId === it.id)?.name
                    : undefined;
                  const xferInLabel = it.gramsPerUOM > 0
                    ? `${Math.floor(xferInG / it.gramsPerUOM)} ${it.unit}${xferInG % it.gramsPerUOM ? ` +${xferInG % it.gramsPerUOM}g` : ""}`
                    : `${xferInG}g`;

                  return (
                    <div key={it.id} className="glass-soft px-2 py-1.5">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[13.5px] font-medium leading-tight">{displayNameFor(it, branch)}</span>
                        <div className="flex flex-shrink-0 items-center gap-1.5">
                          {par != null && <Badge tone="blue">Par {par}</Badge>}
                          <Badge>{it.unit}</Badge>
                        </div>
                      </div>

                      {(xferOut > 0 || xferInG > 0) && (
                        <div className="mb-2 grid gap-1">
                          {xferOut > 0 && (
                            <p className="rounded-md bg-brand-blue/15 px-2 py-1 text-[10.5px] leading-tight text-brand-ink/70">
                              {t(lang, "stock.transferOutNote", { name: xferToName ?? t(lang, "stock.transferFallbackItem"), qty: xferOut, unit: it.unit })}
                              <span className="text-brand-ink/45"> {t(lang, "stock.transferOutSub")}</span>
                            </p>
                          )}
                          {xferInG > 0 && (
                            <p className="rounded-md bg-brand-blue/15 px-2 py-1 text-[10.5px] leading-tight text-brand-ink/70">
                              {t(lang, "stock.transferInNote", { name: xferFromName ?? t(lang, "stock.transferFallbackItem"), amount: xferInLabel })}
                              <span className="text-brand-ink/45"> {t(lang, "stock.transferInSub")}</span>
                            </p>
                          )}
                        </div>
                      )}

                      {/* เต็ม/แพ็ค (หรือ กล่อง ถ้าเป็นกลุ่มเศษรวม) — field-grid บังคับ 4 คอลัมน์เสมอ */}
                      {(it.hasRemainder || grp) ? (
                        <div className="flex gap-1.5">
                          <BlockTag
                            text={grp ? t(lang, "stock.unitBox") : t(lang, "stock.unitPack")}
                            title={N > 0 ? t(lang, "stock.boxUnitTooltip", { unit: grp ? t(lang, "stock.unitBox") : t(lang, "stock.unitPack"), n: N, su }) : undefined}
                          />
                          <div className="grid flex-1 grid-cols-4 gap-1.5">
                            <CompactField label={t(lang, "stock.labelCarry")} value={row.carryPack} readOnly tone="ro" />
                            <CompactField
                              label={t(lang, "stock.labelIn")} value={blankZero(row.inPack)}
                              maxLength={packLimited ? 2 : undefined} warn={inPackWarn}
                              tone="green"
                              onChange={(x) => setField(it.id, "inPack", x, N)}
                            />
                            <CompactField
                              label={t(lang, "stock.labelOutUsedAlt")} value={blankZero(row.used)}
                              maxLength={packLimited ? 2 : undefined} warn={usedWarn}
                              readOnly={isHiddenGroup} tone={isHiddenGroup ? "ro" : undefined}
                              onChange={(x) => setField(it.id, "used", x, N)}
                            />
                            {isHiddenGroup ? (
                              <CompactField label={t(lang, "stock.labelRemain")} value={row.remainPack} readOnly tone="ro" maxLength={packLimited ? 2 : undefined} />
                            ) : (
                              <RemainCell
                                label={t(lang, "stock.labelRemain")} isConfirmed={isConfirmed} value={row.remainPack}
                                warn={remainPackWarn} maxLength={packLimited ? 2 : undefined}
                                confirmLabel={confirmLabel} onConfirm={() => confirmItem(it.id, hasGField)}
                                onUnconfirm={() => unconfirmItem(it.id)}
                                onChange={(x) => setField(it.id, "remainPack", x, N)}
                              />
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-4 gap-1.5">
                          <CompactField label={t(lang, "stock.labelCarry")} value={row.carryPack} readOnly tone="ro" />
                          <CompactField label={t(lang, "stock.labelIn")} value={blankZero(row.inPack)}
                            tone="green"
                            onChange={(x) => setField(it.id, "inPack", x, N)} />
                          <CompactField label={t(lang, "stock.labelOutUsed")} value={blankZero(row.used)}
                            readOnly={isHiddenGroup} tone={isHiddenGroup ? "ro" : undefined}
                            onChange={(x) => setField(it.id, "used", x, N)} />
                          {isHiddenGroup ? (
                            <CompactField label={t(lang, "stock.labelRemain")} value={row.remainPack} readOnly tone="ro" />
                          ) : (
                            <RemainCell
                              label={t(lang, "stock.labelRemain")} isConfirmed={isConfirmed} value={row.remainPack}
                              confirmLabel={confirmLabel} onConfirm={() => confirmItem(it.id, hasGField)}
                              onUnconfirm={() => unconfirmItem(it.id)}
                              onChange={(x) => setField(it.id, "remainPack", x, N)}
                            />
                          )}
                        </div>
                      )}
                      {anyPackWarn && (
                        <div className="mt-1 text-[10px] font-medium text-warn">{t(lang, "stock.invalidQtyWarning")}</div>
                      )}

                      {/* ส่งคืน/เสีย — ซ่อนเป็นดีฟอลต์ (เว้นแต่มีค่าติดมาจาก DB) · กลุ่มเศษรวม (Strawberry/Blueberry) กรอกที่ leader เป็นกรัมอย่างเดียว ไม่มีช่องกล่อง
                          Yogurt 1kg/Box (แพรขอ) — กล่องที่เปิดแล้วเสียไม่เต็มกล่อง มีช่องกรอกเป็นกรัมเพิ่มด้วย */}
                      {(!grp || isLeader) && (
                        <div className="mt-1.5">
                          {returnedExpanded ? (
                            <div className="flex flex-col gap-2">
                              <div className={grp ? "grid grid-cols-1 gap-2" : "grid grid-cols-2 gap-2"}>
                                {!grp && (
                                  <CompactField
                                    label={t(lang, "stock.labelReturned")} value={blankZero(row.returned)}
                                    onChange={(x) => setField(it.id, "returned", x, N)}
                                  />
                                )}
                                {(grp ? isLeader : it.category === "Yogurt 1kg/Box") && (
                                  <CompactField label={t(lang, "stock.labelReturnedG", { unit: su })} value={blankZero(row.returnedG ?? 0)}
                                    onChange={(x) => setField(it.id, "returnedG", x, N)} />
                                )}
                              </div>
                              {(row.returned > 0 || (row.returnedG ?? 0) > 0) && (
                                <label className="flex flex-col gap-0.5">
                                  <span className="text-[8.5px] leading-tight text-brand-ink/50">{t(lang, "stock.labelReturnNote")}</span>
                                  <input className="field px-1.5 py-1 text-left text-xs" placeholder={t(lang, "stock.returnNotePlaceholder")}
                                    value={row.note} onChange={(e) => setNote(it.id, e.target.value)} />
                                </label>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button" onClick={() => setReturnOpen((p) => ({ ...p, [it.id]: true }))}
                              className="text-[11px] font-medium text-brand-ink/40 underline underline-offset-2"
                            >
                              {t(lang, "stock.addReturnButton")}
                            </button>
                          )}
                        </div>
                      )}

                      {/* เศษ: กลุ่ม (เฉพาะ leader) / แกะปกติ */}
                      {grp ? (
                        isLeader ? (
                          <div className="mt-1.5 flex gap-1.5">
                            <BlockTag text={t(lang, "stock.unitGram")} title={t(lang, "stock.remainderGroupTooltip", { group: grp })} />
                            <div className="grid flex-1 grid-cols-3 gap-1.5">
                              <CompactField label={t(lang, "stock.labelCarryG")} value={row.carryG} readOnly tone="ro" />
                              <CompactField label={t(lang, "stock.labelInG")} value={blankZero(row.inG)}
                                tone="green"
                                onChange={(x) => setField(it.id, "inG", x, N)} />
                              {isHiddenGroup ? (
                                <CompactField label={t(lang, "stock.labelRemainG")} value={row.remainG} readOnly tone="ro" />
                              ) : (
                                <RemainCell
                                  label={t(lang, "stock.labelRemainG")} isConfirmed={isConfirmed} value={row.remainG}
                                  onUnconfirm={() => unconfirmItem(it.id)}
                                  onChange={(x) => setField(it.id, "remainG", x, N)}
                                />
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-1.5 rounded-lg bg-black/[.03] px-2 py-1 text-[11px] text-brand-ink/50">
                            {t(lang, "stock.remainderGroupLinked", { group: grp, leader: leaderName })}
                          </div>
                        )
                      ) : it.hasRemainder ? (
                        <div className="mt-1.5 flex gap-1.5">
                          <BlockTag text={it.isCup ? t(lang, "stock.unitPiece") : t(lang, "stock.unitGram")} title={it.isCup ? t(lang, "stock.cupOpenTooltip") : "Sale Unit"} />
                          <div className="grid flex-1 grid-cols-4 gap-1.5">
                            <CompactField label={t(lang, "stock.labelCarryUnit", { unit: su })} value={row.carryG} readOnly tone="ro" />
                            <CompactField label={t(lang, "stock.labelInUnit", { unit: su })} value={blankZero(row.inG)}
                              tone="green"
                              onChange={(x) => setField(it.id, "inG", x, N)} />
                            <CompactField label={t(lang, "stock.labelOutUnit", { unit: su })} value={blankZero(Math.max(d.usedTotalG, 0))}
                              readOnly={isHiddenGroup} tone={isHiddenGroup ? "ro" : undefined}
                              onChange={(x) => setField(it.id, "usedG", x, N)} />
                            {isHiddenGroup ? (
                              <CompactField label={t(lang, "stock.labelRemainUnit", { unit: su })} value={row.remainG} readOnly tone="ro" />
                            ) : (
                              <RemainCell
                                label={t(lang, "stock.labelRemainUnit", { unit: su })} isConfirmed={isConfirmed} value={row.remainG}
                                onUnconfirm={() => unconfirmItem(it.id)}
                                onChange={(x) => setField(it.id, "remainG", x, N)}
                              />
                            )}
                          </div>
                        </div>
                      ) : null}

                      {/* validation */}
                      {grp ? (
                        isLeader && gt ? (
                          gt.overG > 0 ? (
                            <div className="mt-1.5 rounded-lg bg-warn/15 px-2 py-1 text-xs font-medium text-warn">
                              {t(lang, "stock.groupOverWarning", { group: grp, n: gt.overG })}
                            </div>
                          ) : (
                            <div className="mt-1.5 rounded-lg bg-ok/15 px-2 py-1 text-xs font-medium text-ok">
                              {t(lang, "stock.groupOkSummary", { group: grp, used: gt.usedG, remain: gt.remainG, avail: gt.availG })}
                            </div>
                          )
                        ) : null
                      ) : it.hasRemainder ? (
                        d.overG > 0 ? (
                          <div className="mt-1.5 rounded-lg bg-warn/15 px-2 py-1 text-xs font-medium text-warn">
                            {t(lang, "stock.overWarning", {
                              n: d.overG, unit: su,
                              packSuffix: N > 0 ? t(lang, "stock.overWarningPackSuffix", { n: (d.overG / N).toFixed(2) }) : "",
                            })}
                          </div>
                        ) : (filled || it.isCup) ? (
                          <div className={`mt-1.5 rounded-lg px-2 py-1 text-xs font-medium ${it.isCup ? "bg-brand-blue/20 text-sky-700" : "bg-ok/15 text-ok"}`}>
                            {it.isCup
                              ? t(lang, "stock.cupSummaryLine", { remain: d.remainTotalG, used: d.usedTotalG })
                              : t(lang, "stock.hasRemainderOkSummary", { used: d.usedTotalG, remain: d.remainTotalG, unit: su, avail: d.availTotalG })}
                          </div>
                        ) : null
                      ) : v !== 0 ? (
                        <div className="mt-1.5 rounded-lg bg-warn/15 px-2 py-1 text-xs font-medium text-warn">
                          {t(lang, "stock.varianceWarning", { sign: v > 0 ? "+" : "", n: v })}
                        </div>
                      ) : row.returned > 0 ? (
                        // แยก "ขาย" ออกจาก "ส่งคืน" ให้เห็นชัด ไม่รวมเป็นก้อนเดียว (แพรขอ 2026-08-04)
                        <div className="mt-1.5 rounded-lg bg-ok/15 px-2 py-1 text-xs font-medium text-ok">
                          {t(lang, "stock.soldReturnedSummary", { used: row.used, returned: row.returned, unit: it.unit })}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {/* บรรทัดรวมแก้วอยู่ "ล่างสุด" ของหมวด (แพรขอ 2026-07-26) — เดิมอยู่บนสุดแล้วมองข้ามง่ายเพราะต้องเลื่อนกลับขึ้นไปดู */}
                {cupSum && cupSum.count > 0 && (
                  <>
                    {/* ลูกค้าเอาแก้วมาเอง (v1.18) — POS นับว่าขาย แต่ถ้วยร้านไม่ได้ถูกใช้
                        ต้องให้พนักงานกรอกที่นี่ เพราะคนหน้าร้านเป็นคนเดียวที่รู้ · ปกติเว้นว่าง = 0 */}
                    {/* ยุบไว้เป็นดีฟอลต์ (แพรขอ) — เป็นเคสนาน ๆ ที ถ้ากางค้างทุกวันจะรกและ
                        พนักงานสับสนว่าเป็นช่องที่ต้องกรอกทุกวันหรือเปล่า · กางเองถ้ามีตัวเลขค้างอยู่ */}
                    {ownCupOpen ? (
                      <div className="rounded-lg border border-brand-orange/30 bg-white/60 px-2.5 py-2">
                        <div className="mb-1.5 flex items-start justify-between gap-2">
                          <p className="text-[11px] font-medium text-brand-ink/70">
                            {t(lang, "stock.ownCupTitle")}
                            <span className="ml-1 font-normal text-brand-ink/45">{t(lang, "stock.ownCupSubtitle")}</span>
                          </p>
                          <button
                            type="button"
                            onClick={() => setOwnCupOpen(false)}
                            className="shrink-0 text-[10.5px] font-medium text-brand-ink/45 underline underline-offset-2"
                          >
                            {t(lang, "stock.hideAction")}
                          </button>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {CUP_SIZES.map((cs) => (
                            <label key={cs.size} className="flex flex-col gap-0.5">
                              <span className="text-[9px] text-brand-ink/45">{cs.label}</span>
                              <input
                                inputMode="numeric"
                                value={ownCups[cs.size] || ""}
                                onChange={(e) =>
                                  setOwnCups((p) => ({ ...p, [cs.size]: Number(e.target.value) || 0 }))
                                }
                                placeholder="0"
                                className="field px-1 py-1 text-center text-[12px]"
                              />
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOwnCupOpen(true)}
                        className="rounded-lg border border-dashed border-black/15 bg-black/[.02] px-2.5 py-1.5 text-left text-[11px] font-medium text-brand-ink/55"
                      >
                        {t(lang, "stock.ownCupAddButton")}
                      </button>
                    )}

                    {/* แพคมีของไม่ตรงจำนวน (แพรขอ 2026-07-29) — เจอตอนเปิดแพคใช้ ซึ่งเลยขั้นตอนยืนยันรับของไปแล้ว
                        กรอกเป็นส่วนต่างชิ้น (+2 = เกิน · -1 = ขาด) ระบบบวกเข้าฝั่ง "ของที่มี" ให้เอง
                        คนนับจะได้ไม่โดนสงสัยทุกครั้งที่แพคไม่ครบ ทั้งที่นับถูก
                        เอาออกจากพนักงานแล้ว (แพรสั่ง 2026-08-04) — เป็นช่องโหว่ให้แก้ตัวเลขได้เอง
                        พนักงานเจอแพคไม่ครบให้แจ้งแอดมินแทน แอดมินเข้ามาแก้ตรงนี้ให้เอง */}
                    {me?.role !== "admin" ? null : packAdjOpen || cupItems.some((ci) => (rows[ci.id]?.packAdjust ?? 0) !== 0) ? (
                      <div className="rounded-lg border border-brand-blue/40 bg-white/60 px-2.5 py-2">
                        <div className="mb-1.5 flex items-start justify-between gap-2">
                          <p className="text-[11px] font-medium text-sky-700">
                            {t(lang, "stock.packAdjustTitle")}
                            <span className="block text-[10px] font-normal text-brand-ink/45">
                              {t(lang, "stock.packAdjustSub")}
                            </span>
                          </p>
                          <button
                            type="button"
                            onClick={() => setPackAdjOpen(false)}
                            className="shrink-0 text-[10.5px] font-medium text-brand-ink/45 underline underline-offset-2"
                          >
                            {t(lang, "stock.hideAction")}
                          </button>
                        </div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {CUP_SIZES.map((cs) => {
                            const ci = cupItems.find((x) => x.cupSize === cs.size);
                            return (
                              <label key={cs.size} className="flex flex-col gap-0.5">
                                <span className="text-[9px] text-brand-ink/45">{cs.label}</span>
                                <input
                                  inputMode="numeric"
                                  value={ci ? (rows[ci.id]?.packAdjust || "") : ""}
                                  disabled={!ci}
                                  onChange={(e) => ci && setPackAdjust(ci.id, e.target.value)}
                                  placeholder="0"
                                  className="field px-1 py-1 text-center text-[12px]"
                                />
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPackAdjOpen(true)}
                        className="rounded-lg border border-dashed border-black/15 bg-black/[.02] px-2.5 py-1.5 text-left text-[11px] font-medium text-brand-ink/55"
                      >
                        {t(lang, "stock.packAdjustAddButton")}
                      </button>
                    )}

                    <div className="flex items-center justify-between gap-2 rounded-lg bg-brand-orange/20 px-2.5 py-2 text-orange-700">
                      <span className="text-xs font-medium">{t(lang, "stock.cupTotalLabel")}</span>
                      <span className="text-xl font-bold tabular-nums">
                        {cupSum.totalUsed} <span className="text-xs font-medium">{t(lang, "stock.cupTotalUnit")}</span>
                      </span>
                    </div>
                  </>
                )}
              </div>
            </Accordion>
            </React.Fragment>
          );
        })
      )}
      </>)}

      {started && (
      <SaveBar>
        {!loading && total > 0 && (
          <p className={`mb-2 text-center text-xs font-semibold ${unconfirmedCount > 0 ? "text-warn" : "text-ok"}`}>
            {unconfirmedCount > 0
              ? t(lang, "stock.saveBarIncomplete", { n: unconfirmedCount })
              : t(lang, "stock.saveBarComplete")}
          </p>
        )}
        <Button onClick={handleSave} disabled={saving || loading || unconfirmedCount > 0}>
          {saving ? t(lang, "common.saving") : t(lang, "stock.saveButton")}
        </Button>
      </SaveBar>
      )}

      {/* Prompt หลังบันทึกสต็อกสำเร็จ — ชวนไปกรอกยอดขายต่อ (ไม่บังคับ) */}
      {showSavePrompt && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/35 backdrop-blur-[2px]"
          onClick={() => setShowSavePrompt(false)}
        >
          <div
            className="w-full rounded-t-2xl bg-white/95 px-5 pb-6 pt-6 shadow-glass backdrop-blur-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-2.5 grid h-11 w-11 place-items-center rounded-full bg-ok/15 text-lg text-ok">✓</div>
            <p className="text-center text-[16px] font-semibold text-ok">{t(lang, "stock.savedTitle")}</p>
            <p className="mt-0.5 text-center text-[12px] text-brand-ink/55">{t(lang, "stock.savedSubtitle", { branch, date: thaiDate(date) })}</p>
            {/* ลำดับงานหลังนับสต็อกคือไปรายงานยอดขายเสมอ (แพรยืนยัน 2026-07-29)
                เคยให้ปุ่มนี้ชี้ "งานค้างอันแรก" แล้วมันไปโผล่เป็นยืนยันรับของ เพราะมักมีใบเก่าค้างอยู่
                — ซึ่งไม่ใช่งานถัดไปของคนที่เพิ่งนับสต็อกเสร็จ */}
            <Link
              href={`/sales?branch=${branch}&date=${date}`}
              className="mt-3 block rounded-xl bg-brand-red px-4 py-3 text-center text-[15px] font-semibold text-white"
            >
              {t(lang, "stock.goToSalesButton")}
            </Link>
            {/* ใต้ปุ่ม บอกตามจริงว่าวันนี้ยังเหลืออะไรอีกไหม (v1.19) */}
            <TodayNextStep show={showSavePrompt} hideTask={["stock", "receipt"]} noPrimary />
            <button
              type="button"
              onClick={() => setShowSavePrompt(false)}
              className="mt-2 w-full rounded-xl px-4 py-2.5 text-[13px] font-medium text-brand-ink/55"
            >
              {t(lang, "stock.closeButton")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
