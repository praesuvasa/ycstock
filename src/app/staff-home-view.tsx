"use client";
// v1.14 · หน้าหลักของพนักงาน — "วันนี้ต้องทำอะไรบ้าง"
//
// เช็คลิสต์นี้เป็นของ "สาขา" ไม่ใช่ของแต่ละคน — ข้อมูลทุกอย่างผูกกับ (สาขา, วันที่)
// A ยืนยันรับของแล้ว B เปิดมาก็เห็นว่าติ๊กแล้ว ไม่ต้องทำซ้ำ
import React from "react";
import Link from "next/link";
import { GlassCard, Badge } from "@/components/ui";
import { thaiDate } from "@/lib/fmt";
import type { ScheduleRow } from "@/lib/types";
import { useMe, useLang } from "@/components/nav";
import { t, type Lang } from "@/lib/i18n";

interface HomeTask {
  key: string;
  label: string;
  href: string;
  status: "done" | "todo" | "due";
  hint?: string;
}
// ของที่ตรวจวันหมดอายุแล้วสั่ง "ส่งคืน" แต่ยังไม่ได้ฝากขึ้นรถ (v1.21 — แพรขอ)
// เตือนข้ามวันจนกว่าจะกดว่าฝากแล้ว เพราะรถมาไม่ตรงวันที่ตรวจ ของจึงค้างหลังร้านได้หลายวัน
interface PendingReturn {
  id: number;
  checkDate: string;
  itemName: string;
  unit: string;
  qty: number;
  expiryDate: string;
}

interface HomeResp {
  branch: string;
  date: string;
  tasks: HomeTask[];
  remaining: number;
  error?: string;
}

const MARK_STYLE: Record<HomeTask["status"], { cls: string; label: string; textKey: string }> = {
  done: { cls: "bg-ok text-white border-ok", label: "✓", textKey: "store.staff.statusDone" },
  due: { cls: "bg-warn/15 text-warn border-warn/30", label: "!", textKey: "store.staff.statusDue" },
  todo: { cls: "border-black/15 text-brand-ink/35", label: "", textKey: "store.staff.statusTodo" },
};

// ── ตารางงานวันนี้ ──
// ไม่ขึ้นอะไรเลยถ้าวันนั้นยังไม่มีตารางในระบบ (เช่นเลยรอบ 25 ส.ค. ไปแล้วแต่ยังไม่ได้ใส่รอบใหม่)
// ดีกว่าขึ้นกล่องว่าง ๆ ให้พนักงานสงสัยว่าระบบพัง
function TodaySchedule({ branch, date }: { branch: string; date: string }) {
  const lang = useLang();
  const [rows, setRows] = React.useState<ScheduleRow[] | null>(null);
  React.useEffect(() => {
    let alive = true;
    fetch(`/api/schedules?branch=${branch}&date=${date}`)
      .then((r) => r.json())
      .then((d) => { if (alive && !d?.error) setRows(d.rows ?? []); })
      .catch(() => {});
    return () => { alive = false; };
  }, [branch, date]);

  if (!rows || rows.length === 0) return null;
  const working = rows.filter((r) => r.startTime);
  const away = rows.filter((r) => !r.startTime);

  return (
    <GlassCard className="mb-3">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-brand-ink/45">{t(lang, "store.staff.scheduleTitle")}</p>
      {working.length === 0 ? (
        <p className="text-[13px] font-medium text-warn">{t(lang, "store.staff.noOneScheduled")}</p>
      ) : (
        <div className="grid gap-1.5">
          {working.map((r) => (
            <div key={r.employeeName} className="flex items-center justify-between gap-2 rounded-lg bg-white/60 px-2.5 py-1.5">
              <span className="text-[13.5px] font-medium">{r.employeeName}</span>
              <span className="text-[12.5px] tabular-nums text-brand-ink/60">
                {r.startTime}–{r.endTime}
                <span className="ml-1.5 text-[11px] text-brand-ink/40">{r.shiftLabel}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {away.length > 0 && (
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-brand-ink/45">
          {away.map((r) => `${r.employeeName} · ${r.shiftLabel}`).join(" · ")}
        </p>
      )}
    </GlassCard>
  );
}

export function StaffHome() {
  const me = useMe();
  const lang = useLang();
  const [data, setData] = React.useState<HomeResp | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    fetch("/api/home")
      .then((r) => r.json())
      .then((d: HomeResp) => (d.error ? setErr(d.error) : setData(d)))
      .catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  const [returns, setReturns] = React.useState<PendingReturn[]>([]);
  const [sending, setSending] = React.useState(false);
  const loadReturns = React.useCallback(() => {
    fetch("/api/expiry-returns")
      .then((r) => r.json())
      .then((d: { rows?: PendingReturn[] }) => setReturns(d.rows ?? []))
      .catch(() => {});
  }, []);

  async function markDispatched() {
    if (!window.confirm(t(lang, "store.staff.markDispatchedConfirm"))) return;
    setSending(true);
    try {
      await fetch("/api/expiry-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      loadReturns();
    } finally {
      setSending(false);
    }
  }

  React.useEffect(() => { load(); loadReturns(); }, [load, loadReturns]);
  // กลับมาที่แท็บนี้เมื่อไหร่ก็โหลดใหม่ — เพื่อนร่วมกะอาจทำงานไปแล้วระหว่างที่เราสลับไปหน้าอื่น
  React.useEffect(() => {
    const onFocus = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  if (err) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-4">
        <GlassCard><p className="py-6 text-center text-sm text-brand-red">{err}</p></GlassCard>
      </div>
    );
  }
  if (!data) {
    return <p className="py-10 text-center text-sm text-brand-ink/50">{t(lang, "store.staff.loading")}</p>;
  }

  const allDone = data.remaining === 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-20">
      <div className="mb-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[19px] font-semibold leading-tight">{thaiDate(data.date)}</p>
          <Badge tone="blue">{t(lang, "store.staff.branchLabel")}{data.branch}</Badge>
        </div>
        {me?.name && <p className="mt-0.5 text-[14px] font-medium text-brand-ink/60">{me.name}</p>}
      </div>

      {/* ตารางงานวันนี้ (v1.26) — ใครเข้ากะอะไรที่สาขานี้ · อ่านจากตารางกะที่ import มาจากไฟล์ของแพร
          ซ่อนพร้อมเมนูตารางงานจนกว่าจะเปิดใช้จริง (แพรสั่ง) — เข้าคู่กับ staffTimeMenu ใน nav.tsx */}
      {(me?.role === "admin" || me?.features?.staffTimeMenu) && (
        <TodaySchedule branch={data.branch} date={data.date} />
      )}

      <GlassCard className="mb-3">
        {allDone ? (
          <p className="text-[19px] font-semibold leading-tight text-ok">{t(lang, "store.staff.allDone")}</p>
        ) : (
          <p className="text-[19px] font-semibold leading-tight">
            {t(lang, "store.staff.remainingPrefix")}<span className="text-brand-red">{data.remaining}</span>{t(lang, "store.staff.remainingSuffix")}
          </p>
        )}
        <p className="mt-0.5 text-[11.5px] text-brand-ink/50">
          {t(lang, "store.staff.remainingHint")}
        </p>
      </GlassCard>

      {returns.length > 0 && (
        <div className="mb-3 rounded-2xl border border-brand-orange/45 bg-brand-orange/[.1] px-3.5 py-3">
          <p className="text-[17px] font-bold leading-tight text-orange-700">{t(lang, "store.staff.returnsTitle")}</p>
          <p className="mt-0.5 text-[12px] font-medium text-brand-ink/70">
            {t(lang, "store.staff.returnsHint")}
          </p>
          <div className="mt-2 grid gap-1">
            {returns.map((r) => (
              <div key={r.id} className="flex items-baseline gap-2 rounded-lg bg-white/70 px-2.5 py-1.5">
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{r.itemName}</span>
                <span className="shrink-0 text-[12.5px] font-semibold">{r.qty} {r.unit}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={markDispatched}
            disabled={sending}
            className="mt-2.5 w-full rounded-xl bg-brand-ink px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50"
          >
            {sending ? t(lang, "store.staff.markDispatchedSaving") : t(lang, "store.staff.markDispatchedButton")}
          </button>
        </div>
      )}

      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-brand-ink/45">{t(lang, "store.staff.todoTitle")}</p>

      <div className="mb-3 grid gap-2">
        {data.tasks.map((task) => {
          const m = MARK_STYLE[task.status];
          return (
            <Link
              key={task.key}
              href={task.href}
              className="flex items-center gap-3 rounded-xl border border-black/[.07] bg-white/70 px-3.5 py-3 transition hover:bg-white"
            >
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[12px] font-bold ${m.cls}`}>
                {m.label}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[14px] font-medium ${task.status === "done" ? "text-brand-ink/45" : ""}`}>
                  {task.label}
                </span>
                <span className="block text-[11px] text-brand-ink/45">{task.hint ?? t(lang, m.textKey)}</span>
              </span>
              <span className="shrink-0 text-brand-ink/25">›</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
