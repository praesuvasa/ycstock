"use client";
// M4 · Cup Reconcile — reconcile ถ้วยเสิร์ฟ (รองรับสลับขนาด)
import React from "react";
import type { Branch, CupRow, CupSize, Item, Meta, StockRow } from "@/lib/types";
import { cupReconcile, variance } from "@/lib/calc";
import { todayISO, thaiDate } from "@/lib/fmt";
import {
  PageTitle, GlassCard, BranchPicker, NumberField, Stat, Badge, Button, SaveBar,
} from "@/components/ui";
import { useMe } from "@/components/nav";

// ── สรุปยอดขายเทียบ POS (read-only) — จัดกลุ่มไอเทม hasRemainder===false ให้พนักงานเช็คเร็ว ──────────
// หมายเหตุ: การจัดกลุ่มในรายงานนี้ (โดยเฉพาะ "Softserve ถ้วยกระดาษ" ที่ย้ายมาโชว์ในหมวด Shake)
// เป็นแค่การจัดกลุ่มแสดงผลเฉพาะหน้านี้ — ไม่แตะ category จริงของไอเทมในระบบ
interface ReportLine {
  key: string;
  name: string;
  carry: number | null; // null = "—" (ไม่มีความหมายสำหรับแถวรวม)
  inQty: number | null;
  sold: number;
  remain: number | null;
  status: "ok" | "warn" | "none";
  diff?: number;
  isTotal?: boolean;
}

function ReportTable({ title, lines }: { title: string; lines: ReportLine[] }) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 px-1 text-[13px] font-bold">{title}</div>
      {lines.length === 0 ? (
        <GlassCard><p className="text-center text-[12px] text-brand-ink/45">ไม่มีรายการในหมวดนี้</p></GlassCard>
      ) : (
        <div className="overflow-hidden rounded-xl border border-black/5">
          <div className="grid grid-cols-[1fr_40px_40px_40px_44px_58px] items-center gap-1 bg-black/5 px-2 py-1.5 text-[10px] font-medium text-brand-ink/50">
            <span>รายการ</span>
            <span className="text-right">ยกมา</span>
            <span className="text-right">รับเข้า</span>
            <span className="text-right">ขาย</span>
            <span className="text-right">คงเหลือ</span>
            <span className="text-right">สถานะ</span>
          </div>
          {lines.map((l, i) => (
            <div
              key={l.key}
              className={`grid grid-cols-[1fr_40px_40px_40px_44px_58px] items-center gap-1 px-2 py-1.5 text-[11px] ${
                l.isTotal ? "bg-brand-orange/20 font-bold" : i % 2 ? "bg-white/30" : "bg-white/50"
              }`}
            >
              <span className="truncate">{l.name}</span>
              <span className="text-right tabular-nums">{l.carry ?? "—"}</span>
              <span className="text-right tabular-nums">{l.inQty ?? "—"}</span>
              <span className="text-right tabular-nums">{l.sold}</span>
              <span className="text-right tabular-nums">{l.remain ?? "—"}</span>
              <span
                className={`text-right tabular-nums ${
                  l.status === "ok" ? "text-ok font-semibold" : l.status === "warn" ? "text-warn font-bold" : "text-brand-ink/30"
                }`}
              >
                {l.status === "ok" ? "✓" : l.status === "warn" ? `⚠️ ต่าง ${(l.diff ?? 0) > 0 ? "+" : ""}${l.diff}` : "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SIZE_LABEL: Record<CupSize, string> = {
  P: "Cup P (5oz)",
  S: "Cup S (9oz)",
  BOWL: "Small Bowl",
  "14OZ": "Cup (14oz)",
};
const SIZES: CupSize[] = ["P", "S", "BOWL", "14OZ"];

const emptyRows = (): CupRow[] =>
  SIZES.map((size) => ({ size, start: 0, in: 0, remain: 0, sold: 0 }));

export default function CupsPage() {
  const me = useMe();
  const scoped = !!me && me.branchScope !== "all";
  const [branch, setBranch] = React.useState<Branch>("NVP");
  const [date, setDate] = React.useState<string>(todayISO());

  React.useEffect(() => {
    if (scoped) setBranch(me!.branchScope as Branch);
  }, [scoped, me]);
  const [rows, setRows] = React.useState<CupRow[]>(emptyRows());
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [msg, setMsg] = React.useState<string>("");

  const load = React.useCallback(async () => {
    setLoading(true);
    setMsg("");
    try {
      const res = await fetch(`/api/cups?branch=${branch}&date=${date}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "โหลดไม่สำเร็จ");
      // เรียงตามลำดับขนาดมาตรฐานเสมอ
      const bySize = new Map<CupSize, CupRow>(
        (data.rows as CupRow[]).map((r) => [r.size, r])
      );
      setRows(SIZES.map((s) => bySize.get(s) ?? { size: s, start: 0, in: 0, remain: 0, sold: 0 }));
    } catch (e: any) {
      setMsg(e?.message ?? "โหลดไม่สำเร็จ");
      setRows(emptyRows());
    } finally {
      setLoading(false);
    }
  }, [branch, date]);

  React.useEffect(() => { load(); }, [load]);

  const setField = (size: CupSize, key: "start" | "in" | "remain" | "sold", v: string) => {
    const x = parseFloat(v);
    const val = Number.isFinite(x) ? x : 0;
    setRows((prev) => prev.map((r) => (r.size === size ? { ...r, [key]: val } : r)));
  };

  // คำนวณสด
  const summary = React.useMemo(() => cupReconcile(rows), [rows]);
  const perSize = React.useMemo(
    () => new Map(summary.perSize.map((p) => [p.size, p])),
    [summary]
  );

  // ── สรุปยอดขายเทียบ POS (read-only) — ใช้ branch/date เดียวกับด้านบน ──────────
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [stockRows, setStockRows] = React.useState<StockRow[]>([]);
  const [reportLoading, setReportLoading] = React.useState(true);
  const [reportErr, setReportErr] = React.useState<string>("");

  React.useEffect(() => {
    let alive = true;
    fetch("/api/meta")
      .then((r) => r.json())
      .then((m: Meta) => { if (alive) setMeta(m); })
      .catch((e) => { if (alive) setReportErr(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    let alive = true;
    setReportLoading(true);
    setReportErr("");
    fetch(`/api/stock?branch=${branch}&date=${date}`)
      .then((r) => r.json())
      .then((data: { rows?: StockRow[]; error?: string }) => {
        if (!alive) return;
        if (data.error) { setReportErr(data.error); setStockRows([]); return; }
        setStockRows(data.rows ?? []);
      })
      .catch((e) => { if (alive) { setReportErr(String(e?.message ?? e)); setStockRows([]); } })
      .finally(() => { if (alive) setReportLoading(false); });
    return () => { alive = false; };
  }, [branch, date]);

  const stockByItem = React.useMemo(
    () => new Map(stockRows.map((r) => [r.itemId, r] as const)),
    [stockRows]
  );

  const lineFor = React.useCallback((it: Item): ReportLine => {
    const row = stockByItem.get(it.id);
    const carry = row?.carryPack ?? 0;
    const inQty = row?.inPack ?? 0;
    const sold = row?.used ?? 0;
    const remain = row?.remainPack ?? 0;
    const v = row ? variance(row.carryPack, row.inPack, row.used, row.returned, row.remainPack) : 0;
    return { key: it.id, name: it.name, carry, inQty, sold, remain, status: v === 0 ? "ok" : "warn", diff: v };
  }, [stockByItem]);

  const totalLine = React.useCallback((label: string, items: Item[]): ReportLine => {
    const sum = items.reduce((s, it) => s + (stockByItem.get(it.id)?.used ?? 0), 0);
    return { key: `total-${label}`, name: label, carry: null, inQty: null, sold: sum, remain: null, status: "none", isTotal: true };
  }, [stockByItem]);

  const catalog = React.useMemo(() => {
    const items = meta?.items ?? [];
    const byCat = (cat: string) => items.filter((it) => it.category === cat).slice().sort((a, b) => a.sort - b.sort);
    const acai = byCat("ACAI");
    const smoothies = byCat("Smoothies (Pre-packed)");
    const yogurt500 = byCat("Yogurt 500g/Box");
    const softserveCup = items.find((it) => it.name === "Softserve ถ้วยกระดาษ");
    const shake = softserveCup ? [...byCat("Shake แข็ง"), softserveCup] : byCat("Shake แข็ง");
    const drink = byCat("Drink / แยมกระปุก").filter((it) => it.name !== "Peanut Butter");
    const cereals = byCat("Cereals");
    return { items, acai, smoothies, yogurt500, shake, drink, cereals };
  }, [meta]);

  const acaiLines = React.useMemo(() => catalog.acai.map(lineFor), [catalog.acai, lineFor]);
  const smoothiesLines = React.useMemo(
    () => [...catalog.smoothies.map(lineFor), totalLine("รวมขายทั้งหมวด", catalog.smoothies)],
    [catalog.smoothies, lineFor, totalLine]
  );
  const yogurt500Lines = React.useMemo(() => catalog.yogurt500.map(lineFor), [catalog.yogurt500, lineFor]);
  const shakeLines = React.useMemo(() => catalog.shake.map(lineFor), [catalog.shake, lineFor]);
  const drinkLines = React.useMemo(
    () => [...catalog.drink.map(lineFor), totalLine("รวมขายทั้งหมวด", catalog.drink)],
    [catalog.drink, lineFor, totalLine]
  );
  const cerealsLines = React.useMemo(
    () => [...catalog.cereals.map(lineFor), totalLine("รวมขายทั้งหมวด", catalog.cereals)],
    [catalog.cereals, lineFor, totalLine]
  );

  const returnsList = React.useMemo(() => {
    const out: { id: string; name: string; unit: string; returned: number; returnedG: number; note: string }[] = [];
    for (const it of catalog.items) {
      const row = stockByItem.get(it.id);
      if (!row) continue;
      const returned = row.returned ?? 0;
      const returnedG = row.returnedG ?? 0;
      if (returned > 0 || returnedG > 0) {
        out.push({ id: it.id, name: it.name, unit: it.unit, returned, returnedG, note: row.note?.trim() ? row.note : "—" });
      }
    }
    return out;
  }, [catalog.items, stockByItem]);

  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch("/api/cups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, date, rows }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "บันทึกไม่สำเร็จ");
      setMsg("บันทึกแล้ว ✓");
    } catch (e: any) {
      setMsg(e?.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageTitle
        title="Reconcile ถ้วย 🥤"
        right={<Badge tone="neutral">{thaiDate(date)}</Badge>}
      />

      {/* เลือกสาขา + วันที่ */}
      <GlassCard className="mb-3">
        <div className="flex flex-col gap-3">
          <BranchPicker value={branch} onChange={setBranch} locked={scoped} />
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">วันที่</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value || todayISO())}
              className="field"
            />
          </label>
        </div>
      </GlassCard>

      <p className="mb-3 px-1 text-[12px] text-brand-ink/55">
        📦 ตั้งต้น/รับเข้า/คงเหลือ ดึงจากหน้าสต็อก (แพ็ค×50 + เศษ) อัตโนมัติ · กรอกแค่ <b>ขายจริง</b><br />
        ใช้จริง = ตั้งต้น + รับเข้า − คงเหลือ · diff = ใช้จริง − ขาย
      </p>

      {/* แถวรายขนาด */}
      <div className="space-y-2.5">
        {rows.map((r) => {
          const ps = perSize.get(r.size);
          const used = ps?.used ?? 0;
          const diff = ps?.diff ?? 0;
          const diffTone = diff === 0 ? "ok" : "warn";
          return (
            <GlassCard key={r.size}>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-[15px] font-semibold">{SIZE_LABEL[r.size]}</span>
                <Badge tone={diff === 0 ? "ok" : "warn"}>
                  diff {diff > 0 ? `+${diff}` : diff}
                </Badge>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <NumberField label="ตั้งต้น (stock)" value={r.start} readOnly tone="ro" />
                <NumberField label="รับเข้า (stock)" value={r.in} readOnly tone="ro" />
                <NumberField label="คงเหลือ (stock)" value={r.remain} readOnly tone="ro" />
                <NumberField label="ขายจริง (กรอก)" value={r.sold}
                  onChange={(v) => setField(r.size, "sold", v)} />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <NumberField label="ใช้จริง (คำนวณ)" value={used} readOnly tone="auto" />
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] text-brand-ink/50">diff (ใช้−ขาย)</span>
                  <div className={`field ${diff === 0 ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"} font-semibold`}>
                    {diff > 0 ? `+${diff}` : diff}
                  </div>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {/* สรุปรวม */}
      <GlassCard className="mt-3">
        <div className="mb-3 grid grid-cols-3 gap-2">
          <Stat label="ใช้จริงรวม" value={summary.totalUsed} />
          <Stat label="ขายรวม" value={summary.totalSold} />
          <Stat
            label="ต่างรวม"
            value={summary.totalDiff > 0 ? `+${summary.totalDiff}` : summary.totalDiff}
            tone={summary.totalDiff === 0 ? "ok" : "warn"}
          />
        </div>
        <div>
          {summary.balanced ? (
            <Badge tone="ok">✓ ถ้วยตรงทุกขนาด</Badge>
          ) : summary.swapLikely ? (
            <Badge tone="orange">⚠️ น่าจะสลับขนาด (ยอดรวมตรง)</Badge>
          ) : (
            <Badge tone="warn">
              ⚠️ ยอดถ้วยไม่ตรง (ต่าง {Math.abs(summary.totalDiff)})
            </Badge>
          )}
        </div>
      </GlassCard>

      {msg && (
        <p className="mt-3 px-1 text-center text-[13px] text-brand-ink/60">{msg}</p>
      )}

      {/* ── สรุปยอดขายเทียบ POS (read-only) ───────────────────────────────── */}
      <div className="mt-6 border-t border-black/5 pt-4">
        <PageTitle title="สรุปยอดขายเทียบ POS 🧾" />
        <p className="mb-3 px-1 text-[12px] text-brand-ink/55">
          เช็คยอดขายจากสต็อกเทียบ POS ได้เร็ว (read-only) · สถานะ ✓ = ยอดตรง · ⚠️ = ยอดไม่ตรง (โชว์ผลต่างจริง)
        </p>

        {reportErr && (
          <GlassCard className="mb-3"><p className="text-sm text-warn">โหลดข้อมูลไม่สำเร็จ: {reportErr}</p></GlassCard>
        )}

        {reportLoading ? (
          <GlassCard><p className="text-sm text-brand-ink/50">กำลังโหลด…</p></GlassCard>
        ) : (
          <>
            <ReportTable title="ACAI" lines={acaiLines} />
            <ReportTable title="Smoothies (Pre-packed)" lines={smoothiesLines} />
            <ReportTable title="Yogurt 500g/Box" lines={yogurt500Lines} />
            <ReportTable title="Shake (แช่แข็ง)" lines={shakeLines} />
            <ReportTable title="Drink / แยมกระปุก" lines={drinkLines} />
            <ReportTable title="Cereals" lines={cerealsLines} />

            <div className="mb-4">
              <div className="mb-1.5 px-1 text-[13px] font-bold">สินค้าเสีย/ส่งคืน วันนี้</div>
              {returnsList.length === 0 ? (
                <GlassCard><p className="text-center text-[12px] text-brand-ink/45">ไม่มีรายการคืน/เสียวันนี้</p></GlassCard>
              ) : (
                <div className="space-y-1.5">
                  {returnsList.map((r) => (
                    <div key={r.id} className="glass-soft px-3 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[12px] font-medium">{r.name}</span>
                        <div className="flex flex-shrink-0 flex-col items-end gap-0.5 text-[11px] font-semibold text-warn">
                          {r.returnedG > 0 && <span>−{r.returnedG} g</span>}
                          {r.returned > 0 && <span>−{r.returned} {r.unit}</span>}
                        </div>
                      </div>
                      <div className="mt-1 text-[11px] text-brand-ink/50">{r.note}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <SaveBar>
        <Button onClick={save} disabled={saving || loading}>
          {saving ? "กำลังบันทึก…" : loading ? "กำลังโหลด…" : "บันทึก reconcile ถ้วย"}
        </Button>
      </SaveBar>
    </div>
  );
}
