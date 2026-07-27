"use client";
// v1.18 · ความคิดเห็นและข้อเสนอแนะ — ช่องทางให้พนักงานสื่อสารกับบริษัทได้ทุกเรื่อง
//
// เจตนาที่แพรตั้งไว้: "พูดได้โดยไม่ต้องกังวล" — ระบบ เพื่อนร่วมงาน ปัญหางาน อะไรก็ได้
// จึงต้องมีตัวเลือก "ไม่ระบุชื่อ" ที่เป็นจริง: ไม่เก็บชื่อลงฐานข้อมูลตั้งแต่แรก
// และไม่เขียน audit log ตอนส่ง (audit เก็บชื่อผู้ทำเสมอ จะทำให้ไม่ระบุชื่อเสียความหมาย)
import React from "react";
import { useMe } from "@/components/nav";
import { GlassCard, PageTitle, Button } from "@/components/ui";
import type { FeedbackTopic, StaffFeedback } from "@/lib/types";
import { thaiDate } from "@/lib/fmt";

const TOPICS: { v: FeedbackTopic; label: string }[] = [
  { v: "system", label: "ระบบ / แอป" },
  { v: "work", label: "การทำงาน" },
  { v: "team", label: "เพื่อนร่วมงาน" },
  { v: "place", label: "หน้าร้าน / อุปกรณ์" },
  { v: "other", label: "อื่น ๆ" },
];
const TOPIC_LABEL = Object.fromEntries(TOPICS.map((t) => [t.v, t.label])) as Record<string, string>;

function StaffForm() {
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
      if (!res.ok || !d?.ok) throw new Error(d?.error ?? "ส่งไม่สำเร็จ");
      setSent(true);
      setMessage(""); setWantedAction("");
    } catch (e: any) {
      setErr(e?.message ?? "ส่งไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  if (sent) {
    return (
      <GlassCard>
        <p className="py-5 text-center text-[15px] font-medium text-ok">ส่งเรียบร้อยแล้ว ขอบคุณมาก</p>
        <p className="mb-4 text-center text-[12px] leading-relaxed text-brand-ink/55">
          ข้อความถึงบริษัทแล้ว — ถ้าเป็นเรื่องที่ต้องคุยต่อจะมีคนติดต่อกลับ
        </p>
        <Button variant="ghost" onClick={() => setSent(false)}>เขียนเรื่องใหม่</Button>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <p className="mb-3 text-[12.5px] leading-relaxed text-brand-ink/60">
        เขียนได้ทุกเรื่อง — ระบบใช้ยาก งานติดขัด อุปกรณ์เสีย เรื่องกับเพื่อนร่วมงาน
        หรือไอเดียที่อยากให้ร้านดีขึ้น
      </p>

      <div className="grid gap-3">
        <div>
          <span className="mb-1.5 block text-[11px] text-brand-ink/50">เรื่องเกี่ยวกับ</span>
          <div className="flex flex-wrap gap-1.5">
            {TOPICS.map((t) => (
              <button
                key={t.v}
                type="button"
                onClick={() => setTopic(t.v)}
                className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
                  topic === t.v ? "bg-brand-red text-white" : "border border-black/10 bg-white/70 text-brand-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-brand-ink/50">อยากเล่าอะไร</span>
          <textarea
            rows={5} value={message} onChange={(e) => setMessage(e.target.value)}
            className="field text-left leading-relaxed"
            placeholder="เล่าตามที่เกิดขึ้นจริงได้เลย ไม่ต้องเกรงใจ"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-brand-ink/50">อยากให้บริษัททำอะไรต่อจากนี้</span>
          <textarea
            rows={3} value={wantedAction} onChange={(e) => setWantedAction(e.target.value)}
            className="field text-left leading-relaxed"
            placeholder="เช่น อยากให้ซื้อของมาเพิ่ม · อยากให้คุยกับหัวหน้า · แค่อยากให้รับรู้ไว้ก็พอ"
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
            <span className="block text-[12.5px] font-medium">ส่งแบบไม่ระบุชื่อ</span>
            <span className="block text-[11px] leading-relaxed text-brand-ink/50">
              {anonymous
                ? "ระบบจะไม่เก็บชื่อคุณเลย — ไม่มีใครดูย้อนหลังได้ว่าใครส่ง (ยังบอกสาขาไว้ เพื่อให้แก้ปัญหาถูกที่)"
                : "ตอนนี้จะส่งพร้อมชื่อคุณ — ทำให้ติดต่อกลับได้ถ้าต้องคุยต่อ"}
            </span>
          </span>
        </button>

        {err && <p className="rounded-lg bg-brand-red/10 px-2.5 py-2 text-[12px] text-brand-red">{err}</p>}

        <Button onClick={send} disabled={saving || message.trim().length < 5}>
          {saving ? "กำลังส่ง…" : "ส่งถึงบริษัท"}
        </Button>
      </div>
    </GlassCard>
  );
}

function AdminList() {
  const [rows, setRows] = React.useState<StaffFeedback[] | null>(null);
  React.useEffect(() => {
    fetch("/api/feedback")
      .then((r) => r.json())
      .then((d) => setRows(d.rows ?? []))
      .catch(() => setRows([]));
  }, []);

  if (!rows) return <p className="py-8 text-center text-sm text-brand-ink/50">กำลังโหลด…</p>;
  if (rows.length === 0) {
    return <GlassCard><p className="py-8 text-center text-sm text-brand-ink/45">ยังไม่มีข้อความ</p></GlassCard>;
  }

  return (
    <div className="grid gap-2.5">
      {rows.map((r) => (
        <GlassCard key={r.id}>
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-brand-ink/50">
            <span className="rounded-full bg-black/[.06] px-2 py-0.5">{TOPIC_LABEL[r.topic] ?? r.topic}</span>
            {r.branch && <span>สาขา {r.branch}</span>}
            <span>·</span>
            <span>{r.anonymous ? "ไม่ระบุชื่อ" : r.userName ?? "—"}</span>
            {r.createdAt && <span className="ml-auto">{thaiDate(r.createdAt.slice(0, 10))}</span>}
          </div>
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed">{r.message}</p>
          {r.wantedAction && (
            <div className="mt-2 rounded-lg bg-brand-blue/15 px-2.5 py-2">
              <p className="text-[10.5px] font-medium text-sky-700">อยากให้บริษัททำอะไรต่อ</p>
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
  const isAdmin = me?.role === "admin";
  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-16">
      <PageTitle title="ความคิดเห็นและข้อเสนอแนะ" />
      {isAdmin ? <AdminList /> : <StaffForm />}
    </div>
  );
}
