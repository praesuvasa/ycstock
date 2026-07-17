"use client";
import React from "react";
import type { Branch, SalesRow } from "@/lib/types";
import { baht, todayISO } from "@/lib/fmt";
import { GlassCard, BranchPicker, NumberField, Stat, Button, SaveBar, PageTitle, Badge } from "@/components/ui";
import { useMe } from "@/components/nav";

// เก็บ input เป็น string เพื่อให้ลบ/พิมพ์ได้ลื่น แล้วค่อยแปลงเป็นเลขตอนคำนวณ
type Field = keyof SalesRow;
type Form = Record<Field, string>;
const EMPTY: Form = { cash: "", qr: "", edc: "", grab: "", lineman: "" };

const toNum = (v: string): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const fromRow = (row: SalesRow): Form => ({
  cash: String(row.cash ?? 0),
  qr: String(row.qr ?? 0),
  edc: String(row.edc ?? 0),
  grab: String(row.grab ?? 0),
  lineman: String(row.lineman ?? 0),
});

// อ่านสาขา/วันที่จาก query string ถ้ามี (เช่น มาจาก prompt "ไปกรอกยอดขาย" หลังบันทึกสต็อก)
// ใช้ window.location ตรงๆ แทน useSearchParams เพื่อเลี่ยงต้องห่อ Suspense
function fromQuery<T extends string>(key: string, valid: readonly T[], fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const v = new URLSearchParams(window.location.search).get(key);
  return (valid as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
}

export default function SalesPage() {
  const me = useMe();
  const scoped = !!me && me.branchScope !== "all";
  const [branch, setBranch] = React.useState<Branch>(() => fromQuery("branch", ["SND", "NVP", "KCN"] as const, "NVP"));
  const [date, setDate] = React.useState<string>(() => {
    if (typeof window === "undefined") return todayISO();
    const v = new URLSearchParams(window.location.search).get("date");
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : todayISO();
  });

  React.useEffect(() => {
    if (scoped) setBranch(me!.branchScope as Branch);
  }, [scoped, me]);
  const [form, setForm] = React.useState<Form>(EMPTY);
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/sales?branch=${branch}&date=${date}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "โหลดข้อมูลไม่สำเร็จ");
      setForm(fromRow(data.row as SalesRow));
    } catch (e: any) {
      setErr(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
      setForm(EMPTY);
    } finally {
      setLoading(false);
    }
  }, [branch, date]);

  React.useEffect(() => {
    load();
  }, [load]);

  const set = (f: Field) => (v: string) => setForm((p) => ({ ...p, [f]: v }));

  // คำนวณสด
  const inStore = toNum(form.cash) + toNum(form.qr) + toNum(form.edc);
  const delivery = toNum(form.grab) + toNum(form.lineman);
  const total = inStore + delivery;

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const row: SalesRow = {
        cash: toNum(form.cash),
        qr: toNum(form.qr),
        edc: toNum(form.edc),
        grab: toNum(form.grab),
        lineman: toNum(form.lineman),
      };
      const res = await fetch("/api/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, date, row }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "บันทึกไม่สำเร็จ");
      alert("บันทึกยอดขายเรียบร้อย ✓");
    } catch (e: any) {
      setErr(e?.message ?? "บันทึกไม่สำเร็จ");
      alert(e?.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageTitle
        title="ยอดขาย"
        right={loading ? <Badge tone="blue">กำลังโหลด…</Badge> : <Badge tone="ok">{baht(total)}</Badge>}
      />

      {/* สาขา + วันที่ */}
      <GlassCard className="mb-3">
        <div className="flex flex-col gap-3">
          <BranchPicker value={branch} onChange={setBranch} locked={scoped} />
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">วันที่</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="field"
            />
          </label>
        </div>
      </GlassCard>

      {err && (
        <div className="mb-3 rounded-xl border border-brand-red/30 bg-brand-red/10 px-3.5 py-2.5 text-sm text-brand-red">
          {err}
        </div>
      )}

      {/* In-store */}
      <GlassCard className="mb-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">In-store (หน้าร้าน)</h2>
          <Badge tone="neutral">รวม {baht(inStore)}</Badge>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <NumberField label="เงินสด" value={form.cash} onChange={set("cash")} />
          <NumberField label="PromptPay / QR" value={form.qr} onChange={set("qr")} />
          <NumberField label="EDC บัตร" value={form.edc} onChange={set("edc")} />
        </div>
        <div className="mt-3">
          <Stat label="รวม In-store" value={baht(inStore)} tone="default" />
        </div>
      </GlassCard>

      {/* Delivery */}
      <GlassCard className="mb-3">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Delivery</h2>
          <Badge tone="orange">รวม {baht(delivery)}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <NumberField label="Grab" value={form.grab} onChange={set("grab")} />
          <NumberField label="Lineman" value={form.lineman} onChange={set("lineman")} />
        </div>
        <div className="mt-3">
          <Stat label="รวม Delivery" value={baht(delivery)} tone="default" />
        </div>
      </GlassCard>

      {/* รวมทั้งวัน */}
      <GlassCard className="mb-3">
        <div className="grid grid-cols-3 gap-2.5">
          <Stat label="In-store" value={baht(inStore)} />
          <Stat label="Delivery" value={baht(delivery)} />
          <Stat label="รวมทั้งวัน" value={baht(total)} tone="ok" />
        </div>
      </GlassCard>

      <SaveBar>
        <Button onClick={save} disabled={saving || loading}>
          {saving ? "กำลังบันทึก…" : "บันทึกยอดขาย"}
        </Button>
      </SaveBar>
    </div>
  );
}
