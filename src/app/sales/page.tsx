"use client";
import React from "react";
import type { Branch, SalesRow, SalesEvidence, EvidenceType, MatchStatus } from "@/lib/types";
import { baht, todayISO } from "@/lib/fmt";
import { GlassCard, BranchPicker, NumberField, Stat, Button, SaveBar, PageTitle, Badge } from "@/components/ui";
import { useMe } from "@/components/nav";
import { resizeImageToBase64 } from "@/lib/image-client";

const MATCH_LABEL: Record<MatchStatus, { text: string; tone: "ok" | "warn" | "neutral" }> = {
  ok: { text: "✅ ตรงกับที่กรอก", tone: "ok" },
  mismatch: { text: "⚠️ ไม่ตรง", tone: "warn" },
  unclear: { text: "⚠️ อ่านไม่ชัด ตรวจสอบเอง", tone: "warn" },
  duplicate: { text: "🚫 รูปนี้ถูกใช้ไปแล้ว", tone: "warn" },
  pending: { text: "⏳ กำลังตรวจสอบ", tone: "neutral" },
};

// ช่องแนบรูปหลักฐาน (QR/Grab/Lineman) — อัปโหลดแล้วให้ Claude อ่านยอด+เทียบกับที่กรอกทันที
function EvidenceSlot({ branch, date, type, label, enteredAmount, row, onUploaded }: {
  branch: Branch; date: string; type: EvidenceType; label: string; enteredAmount: number;
  row?: SalesEvidence; onUploaded: (row: SalesEvidence) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setBusy(true);
    setErr(null);
    try {
      const { base64, mediaType } = await resizeImageToBase64(file);
      const res = await fetch("/api/sales-evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, date, type, imageBase64: base64, mediaType, enteredAmount }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "อัปโหลดไม่สำเร็จ");
      onUploaded(data.evidence as SalesEvidence);
    } catch (e: any) {
      setErr(e?.message ?? "อัปโหลดไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const m = row ? MATCH_LABEL[row.matchStatus] : null;

  return (
    <div className="flex items-center gap-2 rounded-xl border border-black/5 bg-white/60 px-2.5 py-2">
      {row?.imageUrl ? (
        <a href={row.imageUrl} target="_blank" rel="noreferrer" className="shrink-0">
          <img src={row.imageUrl} alt={label} className="h-10 w-10 rounded-lg object-cover" />
        </a>
      ) : (
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-black/5 text-[9px] text-brand-ink/35">ไม่มีรูป</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[11px] text-brand-ink/50">หลักฐาน{label}</div>
        {m ? (
          <>
            <Badge tone={m.tone}>
              {m.text}{row?.matchStatus === "mismatch" && row.ocrAmount != null ? ` (อ่านได้ ${baht(row.ocrAmount)})` : ""}
            </Badge>
            {row?.matchStatus === "duplicate" && row.duplicateNote && (
              <div className="mt-0.5 text-[10px] text-warn">{row.duplicateNote}</div>
            )}
          </>
        ) : (
          <span className="text-[11px] text-brand-ink/35">ยังไม่แนบ</span>
        )}
        {err && <div className="mt-0.5 text-[10px] text-warn">{err}</div>}
      </div>
      <button
        type="button" onClick={() => inputRef.current?.click()} disabled={busy}
        className="shrink-0 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-50"
      >
        {busy ? "กำลังส่ง…" : row ? "เปลี่ยนรูป" : "แนบรูป"}
      </button>
      <input
        ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
      />
    </div>
  );
}

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

  // หลักฐาน QR/Grab/Lineman ของสาขา+วันที่นี้
  const [evidence, setEvidence] = React.useState<Partial<Record<EvidenceType, SalesEvidence>>>({});
  const loadEvidence = React.useCallback(() => {
    fetch(`/api/sales-evidence?branch=${branch}&date=${date}`)
      .then((r) => r.json())
      .then((d: { rows?: SalesEvidence[] }) => {
        const map: Partial<Record<EvidenceType, SalesEvidence>> = {};
        for (const row of d.rows ?? []) map[row.type] = row;
        setEvidence(map);
      })
      .catch(() => {});
  }, [branch, date]);
  React.useEffect(() => { loadEvidence(); }, [loadEvidence]);

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
        {toNum(form.qr) > 0 && (
          <div className="mt-2.5">
            <EvidenceSlot
              branch={branch} date={date} type="qr" label="สรุปยอด QR เข้าบัญชี" enteredAmount={toNum(form.qr)}
              row={evidence.qr} onUploaded={(row) => setEvidence((p) => ({ ...p, qr: row }))}
            />
          </div>
        )}
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
        <div className="mt-2.5 grid gap-2">
          {toNum(form.grab) > 0 && (
            <EvidenceSlot
              branch={branch} date={date} type="grab" label="สรุปยอด Grab" enteredAmount={toNum(form.grab)}
              row={evidence.grab} onUploaded={(row) => setEvidence((p) => ({ ...p, grab: row }))}
            />
          )}
          {toNum(form.lineman) > 0 && (
            <EvidenceSlot
              branch={branch} date={date} type="lineman" label="สรุปยอด Lineman" enteredAmount={toNum(form.lineman)}
              row={evidence.lineman} onUploaded={(row) => setEvidence((p) => ({ ...p, lineman: row }))}
            />
          )}
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
