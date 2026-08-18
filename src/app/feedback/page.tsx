"use client";
// v1.18 · ความคิดเห็นและข้อเสนอแนะ — ช่องทางให้พนักงานสื่อสารกับบริษัทได้ทุกเรื่อง
//
// เจตนาที่แพรตั้งไว้: "พูดได้โดยไม่ต้องกังวล" — ระบบ เพื่อนร่วมงาน ปัญหางาน อะไรก็ได้
// จึงต้องมีตัวเลือก "ไม่ระบุชื่อ" ที่เป็นจริง: ไม่เก็บชื่อลงฐานข้อมูลตั้งแต่แรก
// และไม่เขียน audit log ตอนส่ง (audit เก็บชื่อผู้ทำเสมอ จะทำให้ไม่ระบุชื่อเสียความหมาย)
import React from "react";
import { useMe, useLang } from "@/components/nav";
import { GlassCard, PageTitle, Button } from "@/components/ui";
import type { FeedbackTopic, StaffFeedback } from "@/lib/types";
import { thaiDate } from "@/lib/fmt";
import { t } from "@/lib/i18n";

const TOPIC_VALUES: FeedbackTopic[] = ["system", "work", "team", "place", "other"];

function StaffForm() {
  const lang = useLang();
  const [topic, setTopic] = React.useState<FeedbackTopic>("work");
  const [message, setMessage] = React.useState("");
  const [wantedAction, setWantedAction] = React.useState("");
  const [anonymous, setAnonymous] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  async function send() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, message, wantedAction, anonymous }),
      });
      const d = await res.json();
      if (!res.ok || !d?.ok) throw new Error(d?.error ?? t(lang, "feedback.staff.errSendFailed"));
      setSent(true);
      setMessage(""); setWantedAction("");
    } catch (e: any) {
      setErr(e?.message ?? t(lang, "feedback.staff.errSendFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (sent) {
    return (
      <GlassCard>
        <p className="py-5 text-center text-[15px] font-medium text-ok">{t(lang, "feedback.staff.sentTitle")}</p>
        <p className="mb-4 text-center text-[12px] leading-relaxed text-brand-ink/55">
          {t(lang, "feedback.staff.sentBody")}
        </p>
        <Button variant="ghost" onClick={() => setSent(false)}>{t(lang, "feedback.staff.writeAnother")}</Button>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <p className="mb-3 text-[12.5px] leading-relaxed text-brand-ink/60">
        {t(lang, "feedback.staff.intro")}
      </p>

      <div className="grid gap-3">
        <div>
          <span className="mb-1.5 block text-[11px] text-brand-ink/50">{t(lang, "feedback.staff.topicLabel")}</span>
          <div className="flex flex-wrap gap-1.5">
            {TOPIC_VALUES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setTopic(v)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                  topic === v ? "bg-brand-red text-white" : "border border-black/10 bg-white/70 text-brand-ink"
                }`}
              >
                {t(lang, `feedback.topics.${v}`)}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-brand-ink/50">{t(lang, "feedback.staff.messageLabel")}</span>
          <textarea
            rows={5} value={message} onChange={(e) => setMessage(e.target.value)}
            className="field text-left leading-relaxed"
            placeholder={t(lang, "feedback.staff.messagePlaceholder")}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-brand-ink/50">{t(lang, "feedback.staff.wantedActionLabel")}</span>
          <textarea
            rows={3} value={wantedAction} onChange={(e) => setWantedAction(e.target.value)}
            className="field text-left leading-relaxed"
          />
        </label>

        <button
          type="button"
          onClick={() => setAnonymous((a) => !a)}
          className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition ${
            anonymous ? "border-brand-red/40 bg-brand-red/[.07]" : "border-black/10 bg-white/60"
          }`}
        >
          <span
            className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border text-[10px] font-bold ${
              anonymous ? "border-brand-red bg-brand-red text-white" : "border-black/25"
            }`}
          >
            {anonymous ? "✓" : ""}
          </span>
          <span className="min-w-0">
            <span className="block text-[12.5px] font-medium">{t(lang, "feedback.staff.anonymousLabel")}</span>
            <span className="block text-[11px] leading-relaxed text-brand-ink/50">
              {anonymous
                ? t(lang, "feedback.staff.anonymousOnHint")
                : t(lang, "feedback.staff.anonymousOffHint")}
            </span>
          </span>
        </button>

        {err && <p className="rounded-lg bg-brand-red/10 px-2.5 py-2 text-[12px] text-brand-red">{err}</p>}

        <Button onClick={send} disabled={saving || message.trim().length < 5}>
          {saving ? t(lang, "feedback.staff.sending") : t(lang, "feedback.staff.submit")}
        </Button>
      </div>
    </GlassCard>
  );
}

function AdminList() {
  const lang = useLang();
  const [rows, setRows] = React.useState<StaffFeedback[] | null>(null);
  React.useEffect(() => {
    fetch("/api/feedback")
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []))
      .catch(() => setRows([]));
  }, []);

  if (!rows) return <p className="py-8 text-center text-sm text-brand-ink/50">{t(lang, "common.loading")}</p>;
  if (rows.length === 0) {
    return <GlassCard><p className="py-8 text-center text-sm text-brand-ink/45">{t(lang, "feedback.admin.empty")}</p></GlassCard>;
  }

  return (
    <div className="grid gap-2.5">
      {rows.map((r) => (
        <GlassCard key={r.id}>
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-brand-ink/50">
            <span className="rounded-full bg-black/[.06] px-2 py-0.5">{t(lang, `feedback.topics.${r.topic}`)}</span>
            {r.branch && <span>{t(lang, "store.staff.branchLabel")}{r.branch}</span>}
            <span>·</span>
            <span>{r.anonymous ? t(lang, "feedback.admin.anonymous") : r.userName ?? "—"}</span>
            {r.createdAt && <span className="ml-auto">{thaiDate(r.createdAt.slice(0, 10))}</span>}
          </div>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{r.message}</p>
          {r.wantedAction && (
            <div className="mt-2 rounded-lg bg-brand-blue/15 px-2.5 py-2">
              <p className="text-[10.5px] font-medium text-sky-700">{t(lang, "feedback.admin.wantedActionLabel")}</p>
              <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-sky-900">{r.wantedAction}</p>
            </div>
          )}
        </GlassCard>
      ))}
    </div>
  );
}

export default function FeedbackPage() {
  const me = useMe();
  const lang = useLang();
  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-16">
      <PageTitle title={t(lang, "nav.account.feedback")} />
      {/* รอ /api/me โหลดก่อนเลือกฟอร์ม — ไม่งั้นแอดมินจะเห็นฟอร์มพนักงานแวบหนึ่งก่อนสลับเป็นรายการจริง */}
      {!me ? (
        <p className="py-8 text-center text-sm text-brand-ink/50">{t(lang, "common.loading")}</p>
      ) : me.role === "admin" ? (
        <AdminList />
      ) : (
        <StaffForm />
      )}
    </div>
  );
}
