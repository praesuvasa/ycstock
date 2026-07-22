"use client";
// M5 · การโอนเงินสด — พนักงานเลือกวันที่มียอดเงินสดค้างโอน (โอนได้หลายวันทีเดียว) + แนบสลิป
// ระบบรวมยอดวันที่เลือกอัตโนมัติ เทียบกับยอดที่อ่านได้จากสลิป + เช็คชื่อผู้รับเงิน
import React from "react";
import type { Branch, CashRemittance, MatchStatus } from "@/lib/types";
import { baht, thaiDate, todayISO } from "@/lib/fmt";
import { GlassCard, BranchPicker, Button, PageTitle, Badge } from "@/components/ui";
import { useMe } from "@/components/nav";
import { resizeImageToBase64 } from "@/lib/image-client";

const MATCH_LABEL: Record<MatchStatus, { text: string; tone: "ok" | "warn" | "neutral" }> = {
  ok: { text: "✅ ตรงกับยอดที่เลือก", tone: "ok" },
  mismatch: { text: "⚠️ ไม่ตรง", tone: "warn" },
  unclear: { text: "⚠️ อ่านไม่ชัด ตรวจสอบเอง", tone: "warn" },
  duplicate: { text: "🚫 สลิปนี้ถูกใช้ไปแล้ว", tone: "warn" },
  pending: { text: "⏳ กำลังตรวจสอบ", tone: "neutral" },
};

export default function CashRemittancePage() {
  const me = useMe();
  const scoped = !!me && me.branchScope !== "all";
  const [branch, setBranch] = React.useState<Branch>("NVP");
  React.useEffect(() => {
    if (scoped) setBranch(me!.branchScope as Branch);
  }, [scoped, me]);

  const [pending, setPending] = React.useState<{ date: string; cash: number }[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [transferredAt, setTransferredAt] = React.useState(todayISO());
  const [history, setHistory] = React.useState<CashRemittance[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const [pendRes, histRes] = await Promise.all([
        fetch(`/api/cash-remittances/pending-days?branch=${branch}`).then((r) => r.json()),
        fetch(`/api/cash-remittances?branch=${branch}`).then((r) => r.json()),
      ]);
      setPending(pendRes.days ?? []);
      setSelected(new Set());
      setHistory(histRes.rows ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [branch]);
  React.useEffect(() => { load(); }, [load]);

  const toggle = (date: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(date)) n.delete(date); else n.add(date);
      return n;
    });

  const total = pending.filter((p) => selected.has(p.date)).reduce((s, p) => s + p.cash, 0);

  async function handleFile(file: File) {
    if (selected.size === 0) { setErr("เลือกวันที่ที่จะโอนก่อน"); return; }
    setSubmitting(true);
    setErr(null);
    try {
      const { base64, mediaType } = await resizeImageToBase64(file);
      const res = await fetch("/api/cash-remittances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, transferredAt, dates: [...selected], imageBase64: base64, mediaType }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "บันทึกไม่สำเร็จ");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("ลบใบโอนนี้? วันที่ที่ครอบคลุมจะกลับไปเป็น \"ยังไม่โอน\" ให้เลือกโอนใหม่ได้")) return;
    setDeletingId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/cash-remittances/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "ลบไม่สำเร็จ");
      await load();
    } catch (e: any) {
      setErr(e?.message ?? "ลบไม่สำเร็จ");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      <PageTitle title="การโอนเงินสด" />

      <GlassCard className="mb-3">
        <BranchPicker value={branch} onChange={setBranch} locked={scoped} />
      </GlassCard>

      {err && (
        <div className="mb-3 rounded-xl border border-brand-red/30 bg-brand-red/10 px-3.5 py-2.5 text-sm text-brand-red">
          {err}
        </div>
      )}

      <GlassCard className="mb-3">
        <h2 className="mb-3 text-[15px] font-semibold">เลือกวันที่ค้างโอน</h2>
        {loading ? (
          <p className="text-sm text-brand-ink/50">กำลังโหลด…</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-brand-ink/50">ไม่มียอดเงินสดค้างโอน</p>
        ) : (
          <div className="grid gap-2">
            {pending.map((p) => (
              <label key={p.date} className="flex items-center gap-2.5 rounded-xl border border-black/5 bg-white/60 px-3 py-2.5">
                <input type="checkbox" checked={selected.has(p.date)} onChange={() => toggle(p.date)} className="h-4 w-4" />
                <span className="flex-1 text-sm">{thaiDate(p.date)}</span>
                <span className="text-sm font-semibold">{baht(p.cash)}</span>
              </label>
            ))}
          </div>
        )}

        {selected.size > 0 && (
          <div className="mt-3 grid gap-2.5">
            <div className="rounded-xl border border-ok/25 bg-ok/[.06] px-3 py-2.5">
              <div className="text-[11px] text-brand-ink/50">ยอดรวมที่เลือก ({selected.size} วัน)</div>
              <div className="text-[17px] font-semibold text-ok">{baht(total)}</div>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-brand-ink/50">วันที่โอนจริง</span>
              <input type="date" value={transferredAt} onChange={(e) => setTransferredAt(e.target.value)} className="field" />
            </label>
            <Button onClick={() => inputRef.current?.click()} disabled={submitting}>
              {submitting ? "กำลังส่ง…" : "แนบสลิปโอนเงิน"}
            </Button>
            <input
              ref={inputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className="mb-3 text-[15px] font-semibold">ประวัติการโอน</h2>
        {history.length === 0 ? (
          <p className="text-sm text-brand-ink/50">ยังไม่มีประวัติ</p>
        ) : (
          <div className="grid gap-2.5">
            {history.map((r) => {
              const m = MATCH_LABEL[r.matchStatus];
              return (
                <div key={r.id} className="flex items-start gap-3 rounded-xl border border-black/5 bg-white/60 p-3">
                  {r.imageUrl && (
                    <a href={r.imageUrl} target="_blank" rel="noreferrer" className="shrink-0">
                      <img src={r.imageUrl} alt="สลิป" className="h-12 w-12 rounded-lg object-cover" />
                    </a>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">โอนวันที่ {thaiDate(r.transferredAt)} · {baht(r.declaredAmount)}</div>
                    <div className="mt-0.5 text-[11px] text-brand-ink/45">
                      ครอบคลุม: {r.coveredDates.map(thaiDate).join(", ")}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge tone={m.tone}>
                        {m.text}{r.matchStatus === "mismatch" && r.ocrAmount != null ? ` (อ่านได้ ${baht(r.ocrAmount)})` : ""}
                      </Badge>
                      <button
                        type="button" onClick={() => handleDelete(r.id)} disabled={deletingId === r.id}
                        className="ml-auto rounded-lg border border-brand-red/25 bg-brand-red/5 px-2.5 py-1 text-[11px] font-medium text-brand-red disabled:opacity-50"
                      >
                        {deletingId === r.id ? "กำลังลบ…" : "ลบ / อัปโหลดใหม่"}
                      </button>
                    </div>
                    {r.matchStatus === "duplicate" && r.duplicateNote && (
                      <div className="mt-1 text-[10px] text-warn">{r.duplicateNote}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
