"use client";
// M4 · Cup Reconcile — reconcile ถ้วยเสิร์ฟ (รองรับสลับขนาด)
import React from "react";
import type { Branch, CupRow, CupSize } from "@/lib/types";
import { cupReconcile } from "@/lib/calc";
import { todayISO, thaiDate } from "@/lib/fmt";
import {
  PageTitle, GlassCard, Segmented, NumberField, Stat, Badge, Button, SaveBar,
} from "@/components/ui";

const BRANCH_OPTS: { value: Branch; label: string }[] = [
  { value: "SND", label: "สาขา SND" },
  { value: "NVP", label: "สาขา NVP" },
];

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
  const [branch, setBranch] = React.useState<Branch>("NVP");
  const [date, setDate] = React.useState<string>(todayISO());
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
          <Segmented options={BRANCH_OPTS} value={branch} onChange={setBranch} />
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

      <SaveBar>
        <Button onClick={save} disabled={saving || loading}>
          {saving ? "กำลังบันทึก…" : loading ? "กำลังโหลด…" : "บันทึก reconcile ถ้วย"}
        </Button>
      </SaveBar>
    </div>
  );
}
