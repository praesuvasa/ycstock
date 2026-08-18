"use client";
// M5 · การโอนเงินสด — พนักงานเลือกวันที่มียอดเงินสดค้างโอน (โอนได้หลายวันทีเดียว) + แนบสลิป
// ระบบรวมยอดวันที่เลือกอัตโนมัติ เทียบกับยอดที่อ่านได้จากสลิป + เช็คชื่อผู้รับเงิน
import React from "react";
import type { Branch, CashRemittance, MatchStatus } from "@/lib/types";
import { baht, thaiDate, todayISO } from "@/lib/fmt";
import { GlassCard, BranchPicker, Button, PageTitle, Badge, Dialog } from "@/components/ui";
import { useMe, useLang } from "@/components/nav";
import { t } from "@/lib/i18n";
import { resizeImageToBase64 } from "@/lib/image-client";

const MATCH_LABEL: Record<MatchStatus, { key: string; tone: "ok" | "warn" | "neutral" }> = {
  ok: { key: "cashRemittance.matchOk", tone: "ok" },
  mismatch: { key: "cashRemittance.matchMismatch", tone: "warn" },
  unclear: { key: "cashRemittance.matchUnclear", tone: "warn" },
  duplicate: { key: "cashRemittance.matchDuplicate", tone: "warn" },
  pending: { key: "cashRemittance.matchPending", tone: "neutral" },
};

export default function CashRemittancePage() {
  const me = useMe();
  const lang = useLang();
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
  // popup ยืนยันผล (แพรสั่ง 2026-07-29) — อัปโหลดสลิปใช้เวลาอ่านรูป ถ้าไม่มีอะไรเด้งบอก พนักงานจะเดินออกก่อนเสร็จ
  const [popup, setPopup] = React.useState<{ tone: "ok" | "warn"; title: string; body?: string } | null>(null);

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
      setErr(e?.message ?? t(lang, "cashRemittance.errLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [branch, lang]);
  React.useEffect(() => { load(); }, [load]);

  const toggle = (date: string) =>
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(date)) n.delete(date); else n.add(date);
      return n;
    });

  const total = pending.filter((p) => selected.has(p.date)).reduce((s, p) => s + p.cash, 0);

  async function handleFile(file: File) {
    if (selected.size === 0) { setErr(t(lang, "cashRemittance.errSelectDateFirst")); return; }
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
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? t(lang, "cashRemittance.errSaveFailed"));
      await load();
      setPopup({ tone: "ok", title: t(lang, "cashRemittance.saveSuccessTitle"), body: t(lang, "cashRemittance.saveSuccessBody") });
    } catch (e: any) {
      setErr(e?.message ?? t(lang, "cashRemittance.errSaveFailed"));
      setPopup({ tone: "warn", title: t(lang, "cashRemittance.saveFailTitle"), body: e?.message ?? t(lang, "cashRemittance.saveFailBodyDefault") });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t(lang, "cashRemittance.deleteConfirm"))) return;
    setDeletingId(id);
    setErr(null);
    try {
      const res = await fetch(`/api/cash-remittances/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? t(lang, "cashRemittance.errDeleteFailed"));
      await load();
    } catch (e: any) {
      setErr(e?.message ?? t(lang, "cashRemittance.errDeleteFailed"));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      {popup && (
        <Dialog
          open tone={popup.tone} title={popup.title}
          actionLabel={popup.tone === "ok" ? t(lang, "cashRemittance.popupOkAction") : t(lang, "cashRemittance.popupCloseAction")}
          onClose={() => setPopup(null)}
        >
          {popup.body}
        </Dialog>
      )}
      <PageTitle title={t(lang, "cashRemittance.pageTitle")} />

      <GlassCard className="mb-3">
        <BranchPicker value={branch} onChange={setBranch} locked={scoped} />
      </GlassCard>

      {err && (
        <div className="mb-3 rounded-xl border border-brand-red/30 bg-brand-red/10 px-3.5 py-2.5 text-sm text-brand-red">
          {err}
        </div>
      )}

      <GlassCard className="mb-3">
        <h2 className="mb-3 text-[15px] font-semibold">{t(lang, "cashRemittance.pendingSectionTitle")}</h2>
        {loading ? (
          <p className="text-sm text-brand-ink/50">{t(lang, "common.loading")}</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-brand-ink/50">{t(lang, "cashRemittance.noPendingDays")}</p>
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
              <div className="text-[11px] text-brand-ink/50">{t(lang, "cashRemittance.selectedTotalLabel", { n: selected.size })}</div>
              <div className="text-[17px] font-semibold text-ok">{baht(total)}</div>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-brand-ink/50">{t(lang, "cashRemittance.transferDateLabel")}</span>
              <input type="date" value={transferredAt} onChange={(e) => setTransferredAt(e.target.value)} className="field" />
            </label>
            <Button onClick={() => inputRef.current?.click()} disabled={submitting}>
              {submitting ? t(lang, "cashRemittance.sending") : t(lang, "cashRemittance.attachSlipButton")}
            </Button>
            <input
              ref={inputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
          </div>
        )}
      </GlassCard>

      <GlassCard>
        <h2 className="mb-3 text-[15px] font-semibold">{t(lang, "cashRemittance.historySectionTitle")}</h2>
        {history.length === 0 ? (
          <p className="text-sm text-brand-ink/50">{t(lang, "cashRemittance.noHistory")}</p>
        ) : (
          <div className="grid gap-2.5">
            {history.map((r) => {
              const m = MATCH_LABEL[r.matchStatus];
              return (
                <div key={r.id} className="flex items-start gap-3 rounded-xl border border-black/5 bg-white/60 p-3">
                  {r.imageUrl && (
                    <a href={r.imageUrl} target="_blank" rel="noreferrer" className="shrink-0">
                      <img src={r.imageUrl} alt={t(lang, "cashRemittance.slipAlt")} className="h-12 w-12 rounded-lg object-cover" />
                    </a>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-[13px] font-medium">{t(lang, "cashRemittance.attachedRow", { date: thaiDate(r.transferredAt), amount: baht(r.declaredAmount) })}</div>
                    <div className="mt-0.5 text-[11px] text-brand-ink/45">
                      {t(lang, "cashRemittance.coveredDatesLabel", { dates: r.coveredDates.map(thaiDate).join(", ") })}
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge tone={m.tone}>{t(lang, m.key)}</Badge>
                      <button
                        type="button" onClick={() => handleDelete(r.id)} disabled={deletingId === r.id}
                        className="ml-auto rounded-lg border border-brand-red/25 bg-brand-red/5 px-2.5 py-1 text-[11px] font-medium text-brand-red disabled:opacity-50"
                      >
                        {deletingId === r.id ? t(lang, "cashRemittance.deleting") : t(lang, "cashRemittance.deleteButton")}
                      </button>
                    </div>
                    {r.matchStatus === "mismatch" && r.mismatchNote && (
                      <div className="mt-1 text-[10px] text-warn">{r.mismatchNote}</div>
                    )}
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
