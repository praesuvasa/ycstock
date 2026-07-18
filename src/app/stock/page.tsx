"use client";
// M1: Stock Entry — กรอกสต็อกรายวัน/สาขา (glass, mobile-first)
// hasRemainder items = UOM (แพ็ค) + Sale Unit (เศษ g). 1 แพ็ค = item.gramsPerUOM กรัม (ตั้งหน้า Settings)
// เศษคงเหลือเกินเมื่อวานได้ (แกะกล่องใหม่) แต่ยอดรวม (แพ็ค×N + เศษ) วันนี้ ต้องไม่เกิน ของที่มี (ยกมา+รับเข้า)
//
// v2 (compact + confirm-gate): ช่อง "คงเหลือ" ทุกไอเทมเริ่มว่าง ต้องกด "✓ เท่ายกมา" หรือพิมพ์ค่าเองก่อน
// ถึงจะนับว่า "ยืนยันแล้ว" — ปุ่มบันทึกจะ disabled จริงจนกว่าจะยืนยันครบทุกรายการ (คนละเงื่อนไขกับ errorCount/variance เดิม)
import React from "react";
import { useRouter } from "next/navigation";
import type { Branch, Item, Meta, StockRow } from "@/lib/types";
import { remainPieces, variance, isCheckDue, weekdayFromDate } from "@/lib/calc";
import { todayISO, thaiDate } from "@/lib/fmt";
import {
  GlassCard, Badge, Button, BranchPicker, Accordion, Stat, SaveBar, PageTitle,
} from "@/components/ui";
import { useMe } from "@/components/nav";

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

const varianceOf = (r: StockRow): number =>
  variance(r.carryPack, r.inPack, r.used, r.returned, r.remainPack);

const isFilled = (r: StockRow): boolean =>
  r.inPack > 0 || r.inG > 0 || r.remainPack !== r.carryPack || r.remainG !== r.carryG;

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
            ยืนยัน?
          </div>
        )}
      </label>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[8.5px] leading-tight text-brand-ink/50">{label}</span>
        <button type="button" onClick={onUnconfirm} className="text-[8.5px] text-sky-700 underline">แก้ไข</button>
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
  const router = useRouter();
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
  const [rows, setRows] = React.useState<Record<string, StockRow>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  // ยืนยันแล้วหรือยัง ต่อไอเทม (reset ทุกครั้งที่เปลี่ยนสาขา/วันที่ = รอบใหม่)
  const [confirmed, setConfirmed] = React.useState<Record<string, boolean>>({});
  // เปิด/ปิด panel "ส่งคืน/เสีย" ต่อไอเทม (default ปิด เว้นแต่มีค่า returned ติดมา)
  const [returnOpen, setReturnOpen] = React.useState<Record<string, boolean>>({});

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
      .then((data: { rows?: StockRow[]; error?: string }) => {
        if (!alive) return;
        if (data.error) { setErr(data.error); return; }
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
      // แสดงรายการที่ stock ในสาขานี้ + ทุกสมาชิกกลุ่มเศษรวม (ให้นับกล่องได้ทุกขนาด) + ถึงรอบเช็ควันนี้ (daily/จันทร์+พฤหัส)
      .filter((it) => (meta.par[it.id]?.[branch] != null || it.remainderGroup) && isCheckDue(it.checkFrequency, weekday))
      .sort((a, b) => a.sort - b.sort);
    const out: { category: string; items: Item[] }[] = [];
    for (const it of shown) {
      let g = out.find((x) => x.category === it.category);
      if (!g) { g = { category: it.category, items: [] }; out.push(g); }
      g.items.push(it);
    }
    return out;
  }, [meta, branch, weekday]);

  const shownItems = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const total = shownItems.length;

  // รายการที่ไม่ถึงรอบเช็ควันนี้ (checkFrequency=monThu แต่วันนี้ไม่ใช่จันทร์/พฤหัส) — ซ่อนไว้เป็นค่าเริ่มต้น
  // แต่ของอาจเข้าสาขาวันไหนก็ได้ (ไม่ผูกกับรอบเช็ค) เลยต้องมีทางกดดู/กรอกได้เผื่อมีของเข้าวันที่ไม่ตรงรอบ
  const [showHidden, setShowHidden] = React.useState(false);
  const hiddenGroups = React.useMemo(() => {
    if (!meta) return [] as { category: string; items: Item[] }[];
    const shown = meta.items
      .filter((it) => (meta.par[it.id]?.[branch] != null || it.remainderGroup) && !isCheckDue(it.checkFrequency, weekday))
      .sort((a, b) => a.sort - b.sort);
    const out: { category: string; items: Item[] }[] = [];
    for (const it of shown) {
      let g = out.find((x) => x.category === it.category);
      if (!g) { g = { category: it.category, items: [] }; out.push(g); }
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
    const gs = meta.items
      .filter((it) => it.remainderGroup) // ทุกสมาชิกกลุ่ม (ไม่ว่า par จะมีหรือไม่)
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
      cur.totalUsed += d.usedTotalG;
      map.set(it.category, cur);
    }
    return map;
  }, [shownItems, rows]);

  // นับ ยืนยันแล้ว (จาก confirmed map) + ค้างยืนยัน + รายการที่เกิน (คงเหลือรวมเกินของที่มี / variance / กลุ่มเกิน)
  const { filledCount, errorCount, unconfirmedCount } = React.useMemo(() => {
    let filled = 0, error = 0, unconfirmed = 0;
    for (const it of shownItems) {
      const r = rows[it.id];
      if (!r) continue;
      if (confirmed[it.id]) filled++; else unconfirmed++;
      if (it.remainderGroup) continue; // กลุ่มเช็คแยกด้านล่าง
      const bad = it.hasRemainder
        ? derive(r, it.gramsPerUOM).usedTotalG < 0
        : varianceOf(r) !== 0;
      if (bad) error++;
    }
    for (const [g] of groupIds) if (groupTotals(g).overG > 0) error++;
    return { filledCount: filled, errorCount: error, unconfirmedCount: unconfirmed };
  }, [shownItems, rows, groupIds, groupTotals, confirmed]);

  type NumField = "inPack" | "used" | "remainPack" | "returned" | "inG" | "usedG" | "remainG" | "returnedG";
  // คงเหลือแพ็ค = ยกมา + รับเข้า − ออก/ขาย − ส่งคืน/เสีย (ส่งคืนหักจากยอด stock)
  const calcRemainPack = (r: StockRow) => Math.max(r.carryPack + r.inPack - r.used - r.returned, 0);
  function setField(itemId: string, field: NumField, raw: string, N: number) {
    setRows((prev) => {
      const cur = prev[itemId];
      if (!cur) return prev;
      const val = toNum(raw);
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
          const openedG = Math.max(next.carryPack + next.inPack - next.remainPack, 0) * N;
          const availForSale = next.carryG + next.inG + openedG;
          next.remainG = Math.max(availForSale - val, 0);
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
      next.variance = varianceOf(next);
      return { ...prev, [itemId]: next };
    });
    // พิมพ์ค่าใดๆ ในไอเทมนี้ = ถือว่ายืนยันแล้ว (ไม่ต้องกดปุ่ม "✓ เท่ายกมา" ซ้ำ)
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
      next.variance = varianceOf(next);
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
      const ok = window.confirm(`มี ${errorCount} รายการที่คงเหลือรวมเกินของที่มี\nต้องการบันทึกเลยไหม?`);
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
        .map((r) => ({ ...r, variance: varianceOf(r) }));
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, date, rows: payload }),
      });
      const data = (await res.json()) as { updated?: number; inserted?: number; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      setShowSavePrompt(true); // แทน alert เดิม — ชวนไปกรอกยอดขายต่อ
    } catch (e: any) {
      window.alert(`บันทึกไม่สำเร็จ: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-24">
      <PageTitle title="กรอกสต็อกรายวัน" right={<Badge tone="blue">{thaiDate(date)}</Badge>} />

      <GlassCard className="mb-3">
        <div className="grid gap-3">
          <BranchPicker value={branch} onChange={setBranch} locked={scoped} />
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">วันที่</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
          </label>
        </div>
      </GlassCard>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="ยืนยันแล้ว" value={`${filledCount}/${total}`} tone={total > 0 && filledCount === total ? "ok" : "default"} />
        <Stat label="ค้างยืนยัน" value={unconfirmedCount > 0 ? `${unconfirmedCount}` : "0"} tone={unconfirmedCount > 0 ? "warn" : "ok"} />
        <Stat label="เกิน / ผิด" value={errorCount > 0 ? `⚠️ ${errorCount}` : "—"} tone={errorCount > 0 ? "warn" : "default"} />
      </div>

      {hiddenTodayCount > 0 && (
        <button
          type="button"
          onClick={() => setShowHidden((v) => !v)}
          className="mb-3 flex w-full items-center justify-between gap-2 rounded-lg border border-warn/30 bg-warn/5 px-3 py-2.5 text-left text-sm text-brand-ink/70"
        >
          <span>
            {showHidden
              ? `กำลังแสดง ${hiddenTodayCount} รายการที่ไม่ถึงรอบเช็ค — กรอกได้ปกติถ้ามีของเข้า`
              : `ซ่อนไว้ ${hiddenTodayCount} รายการที่ไม่ถึงรอบเช็ค — กรอกข้อมูลรับเข้ากดเพื่อแสดงรายการ`}
          </span>
          <span className="shrink-0 font-semibold text-sky-700 underline underline-offset-2">
            {showHidden ? "ซ่อน" : "แสดงรายการ"}
          </span>
        </button>
      )}

      {err && (
        <GlassCard className="mb-3">
          <p className="text-sm text-warn">โหลดข้อมูลไม่สำเร็จ: {err}</p>
        </GlassCard>
      )}

      {loading ? (
        <GlassCard><p className="text-sm text-brand-ink/50">กำลังโหลด…</p></GlassCard>
      ) : groups.length === 0 ? (
        <GlassCard><p className="text-sm text-brand-ink/50">ไม่มีรายการสต็อกสำหรับสาขานี้</p></GlassCard>
      ) : (
        displayGroups.map((g, gi) => {
          const cupSum = cupSummaryByCategory.get(g.category);
          const isHiddenGroup = hiddenCategorySet.has(g.category);
          const categoryIncomplete = !isHiddenGroup && g.items.some((it) => rows[it.id] && !confirmed[it.id]);
          return (
            <Accordion
              key={g.category}
              title={
                <span className="flex items-center gap-1.5">
                  {g.category}
                  {isHiddenGroup ? (
                    <span className="rounded-full bg-ok/15 px-1.5 py-0.5 text-[10px] font-semibold text-ok">
                      ยังไม่ถึงรอบเช็ค กรอกรับเข้า
                    </span>
                  ) : categoryIncomplete && (
                    <span className="rounded-full bg-warn/15 px-1.5 py-0.5 text-[10px] font-semibold text-warn">
                      กรอกไม่ครบ
                    </span>
                  )}
                </span>
              }
              count={`${g.items.length} รายการ`}
              defaultOpen={gi === 0}
            >
              <div className="grid gap-2 py-1">
                {cupSum && cupSum.count > 0 && (
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-brand-orange/20 px-2.5 py-2 text-orange-700">
                    <span className="text-xs font-medium">🥤 รวมแก้วทุกขนาดที่ใช้ไปวันนี้</span>
                    <span className="text-xl font-bold tabular-nums">
                      {cupSum.totalUsed} <span className="text-xs font-medium">ชิ้น</span>
                    </span>
                  </div>
                )}
                {g.items.map((it) => {
                  const row = rows[it.id];
                  if (!row) return null;
                  const N = it.gramsPerUOM;
                  const d = derive(row, N);
                  const filled = isFilled(row);
                  const v = varianceOf(row);
                  const su = it.isCup ? "ชิ้น" : "g"; // หน่วยย่อย: ถ้วยนับชิ้น · อื่นเป็นกรัม
                  const grp = it.remainderGroup;
                  const isLeader = !!grp && groupIds.get(grp)?.[0] === it.id;
                  const gt = grp ? groupTotals(grp) : null;
                  const leaderName = gt ? itemById.get(gt.leaderId)?.name ?? "" : "";
                  const par = meta?.par[it.id]?.[branch] ?? null;
                  const isConfirmed = !!confirmed[it.id];

                  // จำกัดช่องแพ็ค ≤15 เฉพาะไอเทม hasRemainder === true (กันสลับกับช่องกรัม) — ไม่แตะบล็อกกรัม/กลุ่ม
                  const packLimited = it.hasRemainder;
                  const inPackWarn = packLimited && row.inPack > 15;
                  const usedWarn = packLimited && row.used > 15;
                  const remainPackWarn = packLimited && row.remainPack > 15;
                  const anyPackWarn = inPackWarn || usedWarn || remainPackWarn;

                  // ไอเทมนี้มีช่องเศษ (g) ที่ต้องยืนยันคู่กับ pack ไหม (leader กลุ่ม หรือ hasRemainder เดี่ยว)
                  const hasGField = it.hasRemainder || (!!grp && isLeader);
                  const confirmLabel = hasGField
                    ? `✓ เท่ายกมา (${row.carryPack} แพ็ค + ${row.carryG} ${su})`
                    : `✓ เท่ายกมา (${row.carryPack} แพ็ค)`;

                  const returnedExpanded = returnOpen[it.id] ?? (row.returned > 0 || (row.returnedG ?? 0) > 0);

                  return (
                    <div key={it.id} className="glass-soft px-3 py-2.5">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{it.name}</span>
                        <div className="flex flex-shrink-0 items-center gap-1.5">
                          {par != null && <Badge tone="blue">Par {par}</Badge>}
                          <Badge>{it.unit}</Badge>
                        </div>
                      </div>

                      {/* เต็ม/แพ็ค (หรือ กล่อง ถ้าเป็นกลุ่มเศษรวม) — field-grid บังคับ 4 คอลัมน์เสมอ */}
                      {(it.hasRemainder || grp) ? (
                        <div className="flex gap-1.5">
                          <BlockTag
                            text={grp ? "กล่อง" : "แพ็ค"}
                            title={N > 0 ? `1 ${grp ? "กล่อง" : "แพ็ค"} = ${N} ${su}` : undefined}
                          />
                          <div className="grid flex-1 grid-cols-4 gap-1.5">
                            <CompactField label="ยกมา" value={row.carryPack} readOnly tone="ro" />
                            <CompactField
                              label="รับเข้า" value={blankZero(row.inPack)}
                              maxLength={packLimited ? 2 : undefined} warn={inPackWarn}
                              tone={isHiddenGroup ? "green" : undefined}
                              onChange={(x) => setField(it.id, "inPack", x, N)}
                            />
                            <CompactField
                              label="แกะ/ออก" value={blankZero(row.used)}
                              maxLength={packLimited ? 2 : undefined} warn={usedWarn}
                              readOnly={isHiddenGroup} tone={isHiddenGroup ? "ro" : undefined}
                              onChange={(x) => setField(it.id, "used", x, N)}
                            />
                            {isHiddenGroup ? (
                              <CompactField label="คงเหลือ" value={row.remainPack} readOnly tone="ro" maxLength={packLimited ? 2 : undefined} />
                            ) : (
                              <RemainCell
                                label="คงเหลือ" isConfirmed={isConfirmed} value={row.remainPack}
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
                          <CompactField label="ยกมา" value={row.carryPack} readOnly tone="ro" />
                          <CompactField label="รับเข้า" value={blankZero(row.inPack)}
                            tone={isHiddenGroup ? "green" : undefined}
                            onChange={(x) => setField(it.id, "inPack", x, N)} />
                          <CompactField label="ขาย/ใช้" value={blankZero(row.used)}
                            readOnly={isHiddenGroup} tone={isHiddenGroup ? "ro" : undefined}
                            onChange={(x) => setField(it.id, "used", x, N)} />
                          {isHiddenGroup ? (
                            <CompactField label="คงเหลือ" value={row.remainPack} readOnly tone="ro" />
                          ) : (
                            <RemainCell
                              label="คงเหลือ" isConfirmed={isConfirmed} value={row.remainPack}
                              confirmLabel={confirmLabel} onConfirm={() => confirmItem(it.id, hasGField)}
                              onUnconfirm={() => unconfirmItem(it.id)}
                              onChange={(x) => setField(it.id, "remainPack", x, N)}
                            />
                          )}
                        </div>
                      )}
                      {anyPackWarn && (
                        <div className="mt-1 text-[10px] font-medium text-warn">⚠️ จำนวนผิด</div>
                      )}

                      {/* ส่งคืน/เสีย — ซ่อนเป็นดีฟอลต์ (เว้นแต่มีค่าติดมาจาก DB) · กลุ่มเศษรวม (Strawberry/Blueberry) กรอกที่ leader เป็นกรัมอย่างเดียว ไม่มีช่องกล่อง */}
                      {(!grp || isLeader) && (
                        <div className="mt-2">
                          {returnedExpanded ? (
                            <div className="flex flex-col gap-2">
                              <div className={grp ? "grid grid-cols-1 gap-2" : "grid grid-cols-2 gap-2"}>
                                {!grp && (
                                  <CompactField
                                    label="ส่งคืน/เสีย" value={blankZero(row.returned)}
                                    onChange={(x) => setField(it.id, "returned", x, N)}
                                  />
                                )}
                                {grp && isLeader && (
                                  <CompactField label="ส่งคืนเศษ (g)" value={blankZero(row.returnedG ?? 0)}
                                    onChange={(x) => setField(it.id, "returnedG", x, N)} />
                                )}
                              </div>
                              {(row.returned > 0 || (row.returnedG ?? 0) > 0) && (
                                <label className="flex flex-col gap-0.5">
                                  <span className="text-[8.5px] leading-tight text-brand-ink/50">หมายเหตุ (ส่งคืน/เสีย)</span>
                                  <input className="field px-1.5 py-1 text-left text-xs" placeholder="เหตุผล เช่น หมดอายุ / แตก"
                                    value={row.note} onChange={(e) => setNote(it.id, e.target.value)} />
                                </label>
                              )}
                            </div>
                          ) : (
                            <button
                              type="button" onClick={() => setReturnOpen((p) => ({ ...p, [it.id]: true }))}
                              className="text-[11px] font-medium text-brand-ink/40 underline underline-offset-2"
                            >
                              + ส่งคืน/เสีย
                            </button>
                          )}
                        </div>
                      )}

                      {/* เศษ: กลุ่ม (เฉพาะ leader) / แกะปกติ */}
                      {grp ? (
                        isLeader ? (
                          <div className="mt-2 flex gap-1.5">
                            <BlockTag text="กรัม" title={`เศษรวมกลุ่ม ${grp} — กรอกที่รายการนี้ที่เดียว`} />
                            <div className="grid flex-1 grid-cols-3 gap-1.5">
                              <CompactField label="ยกมา g" value={row.carryG} readOnly tone="ro" />
                              <CompactField label="รับเข้า g" value={blankZero(row.inG)}
                                tone={isHiddenGroup ? "green" : undefined}
                                onChange={(x) => setField(it.id, "inG", x, N)} />
                              {isHiddenGroup ? (
                                <CompactField label="เศษคงเหลือ g" value={row.remainG} readOnly tone="ro" />
                              ) : (
                                <RemainCell
                                  label="เศษคงเหลือ g" isConfirmed={isConfirmed} value={row.remainG}
                                  onUnconfirm={() => unconfirmItem(it.id)}
                                  onChange={(x) => setField(it.id, "remainG", x, N)}
                                />
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="mt-2 rounded-lg bg-black/[.03] px-2.5 py-1.5 text-[11px] text-brand-ink/50">
                            🔗 เศษรวมกลุ่ม {grp} — กรอกที่ “{leaderName}”
                          </div>
                        )
                      ) : it.hasRemainder ? (
                        <div className="mt-2 flex gap-1.5">
                          <BlockTag text={it.isCup ? "ชิ้น" : "กรัม"} title={it.isCup ? "ถ้วยเปิดแพ็ค" : "Sale Unit"} />
                          <div className="grid flex-1 grid-cols-4 gap-1.5">
                            <CompactField label={`ยกมา ${su}`} value={row.carryG} readOnly tone="ro" />
                            <CompactField label={`รับเข้า ${su}`} value={blankZero(row.inG)}
                              tone={isHiddenGroup ? "green" : undefined}
                              onChange={(x) => setField(it.id, "inG", x, N)} />
                            <CompactField label={`ขาย/ใช้ ${su}`} value={blankZero(Math.max(d.usedTotalG, 0))}
                              readOnly={isHiddenGroup} tone={isHiddenGroup ? "ro" : undefined}
                              onChange={(x) => setField(it.id, "usedG", x, N)} />
                            {isHiddenGroup ? (
                              <CompactField label={`คงเหลือ ${su}`} value={row.remainG} readOnly tone="ro" />
                            ) : (
                              <RemainCell
                                label={`คงเหลือ ${su}`} isConfirmed={isConfirmed} value={row.remainG}
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
                            <div className="mt-2 rounded-lg bg-warn/15 px-2.5 py-1.5 text-xs font-medium text-warn">
                              ⚠️ เศษรวมกลุ่ม {grp} เกินของที่มี (เกิน {gt.overG} g)
                            </div>
                          ) : (
                            <div className="mt-2 rounded-lg bg-ok/15 px-2.5 py-1.5 text-xs font-medium text-ok">
                              ✓ กลุ่ม {grp}: ใช้ไปรวม {gt.usedG} g · คงเหลือรวม {gt.remainG} g (มี {gt.availG} g)
                            </div>
                          )
                        ) : null
                      ) : it.hasRemainder ? (
                        d.overG > 0 ? (
                          <div className="mt-2 rounded-lg bg-warn/15 px-2.5 py-1.5 text-xs font-medium text-warn">
                            ⚠️ คงเหลือรวมเกินของที่มี (เกิน {d.overG} {su}){N > 0 ? ` ≈ ${(d.overG / N).toFixed(2)} แพ็ค` : ""}
                          </div>
                        ) : (filled || it.isCup) ? (
                          <div className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs font-medium ${it.isCup ? "bg-brand-blue/20 text-sky-700" : "bg-ok/15 text-ok"}`}>
                            {it.isCup
                              ? `📊 รวมทั้งหมด ${d.remainTotalG} ชิ้น (บันทึกวันนี้) · ใช้/ขาย ${d.usedTotalG} ชิ้น — กระทบยอดที่หน้า "ถ้วย"`
                              : `✓ รวมใช้ไป ${d.usedTotalG} ${su} · คงเหลือรวม ${d.remainTotalG} ${su} (มี ${d.availTotalG} ${su})`}
                          </div>
                        ) : null
                      ) : v !== 0 ? (
                        <div className="mt-2 rounded-lg bg-warn/15 px-2.5 py-1.5 text-xs font-medium text-warn">
                          ⚠️ ยอดไม่ตรง (ต่าง {v > 0 ? "+" : ""}{v})
                        </div>
                      ) : filled ? (
                        <div className="mt-2 rounded-lg bg-ok/15 px-2.5 py-1.5 text-xs font-medium text-ok">
                          ✓ ยอดตรง
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Accordion>
          );
        })
      )}

      <SaveBar>
        {!loading && total > 0 && (
          <p className={`mb-2 text-center text-xs font-semibold ${unconfirmedCount > 0 ? "text-warn" : "text-ok"}`}>
            {unconfirmedCount > 0
              ? `⚠️ ยังไม่ครบ — เหลือ ${unconfirmedCount} รายการที่ยังไม่ยืนยัน/กรอก`
              : "✓ ครบทุกรายการแล้ว พร้อมบันทึก"}
          </p>
        )}
        <Button onClick={handleSave} disabled={saving || loading || unconfirmedCount > 0}>
          {saving ? "กำลังบันทึก…" : "บันทึกสต็อกวันนี้"}
        </Button>
      </SaveBar>

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
            <p className="text-center text-[15px] font-semibold">บันทึกสต็อกวันนี้แล้ว</p>
            <p className="mb-4 text-center text-[13px] text-brand-ink/60">กรอกยอดขายวันนี้เลยไหม?</p>
            <div className="flex flex-col gap-2">
              <Button onClick={() => router.push(`/sales?branch=${branch}&date=${date}`)}>
                ไปกรอกยอดขาย →
              </Button>
              <button
                type="button"
                onClick={() => setShowSavePrompt(false)}
                className="rounded-xl px-4 py-2.5 text-[13px] font-medium text-brand-ink/55"
              >
                ปิด (กรอกทีหลัง)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
