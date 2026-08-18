"use client";
// v1.28 · ตารางงาน — มุมมองตาราง (คน × วัน) แบบเดียวกับไฟล์ Roster ที่ทีมใช้กันอยู่
//
// ทำไมเปลี่ยนจากลิสต์รายวันเป็นตาราง (แพรสั่ง 2026-07-30):
// คำถามที่พนักงานถามจริงคือ "วันนี้อยู่กับใคร" และ "อาทิตย์นี้ใครว่าง" — ลิสต์รายวันตอบไม่ได้
// ต้องเลื่อนดูทีละวัน · ตารางแบบนี้กวาดตาแนวนอนได้ทั้งเดือน เห็นคู่กะทันที
//
// แก้ตาราง/ขอลา = แตะช่องนั้นตรง ๆ ไม่ต้องกรอกฟอร์มเลือกคน+วันที่ซ้ำอีก
import React from "react";
import { GlassCard, PageTitle, Badge, BranchPicker, Dialog } from "@/components/ui";
import { useMe, useLang } from "@/components/nav";
import { t, type Lang } from "@/lib/i18n";
import { thaiDate, todayISO } from "@/lib/fmt";
import type { Branch, ScheduleRow } from "@/lib/types";

type Row = ScheduleRow & { workDate: string };

// key ของ t(lang, `schedule.dow.${...}`) — ไม่ใช่ข้อความที่โชว์ตรง ๆ
const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const WORKING = new Set(["F", "M", "A", "FH", "PT"]);

// สีเดียวกับไฟล์ Roster ที่ทีมคุ้นอยู่แล้ว — ส้ม=เต็มวัน ฟ้า=เช้า เขียว=บ่าย เหลือง=ครึ่งวัน เทา=หยุด แดง=ลา
const CELL: Record<string, string> = {
  F: "bg-brand-orange/30 text-orange-900",
  M: "bg-brand-blue/35 text-sky-900",
  A: "bg-ok/20 text-ok",
  FH: "bg-warn/20 text-warn",
  PT: "bg-brand-blue/20 text-sky-800",
  OFF: "bg-black/[.05] text-brand-ink/35",
  CLOSED: "bg-black/[.08] text-brand-ink/30",
  PH: "bg-brand-red/20 text-brand-red",
  AL: "bg-brand-red/15 text-brand-red",
  SL: "bg-brand-red/15 text-brand-red",
  PL: "bg-brand-red/15 text-brand-red",
  LWP: "bg-brand-red/15 text-brand-red",
};
// F/M/A/PT เป็นรหัสกะตรงกับไฟล์ Roster ทั้งสองภาษา ไม่ต้องแปล — ที่เหลือแปลผ่าน t()
const SHORT_KEY: Record<string, string> = {
  FH: "schedule.shift.short.fh",
  OFF: "schedule.shift.short.off",
  CLOSED: "schedule.shift.short.closed",
  PH: "schedule.shift.short.ph",
  AL: "schedule.shift.short.al",
  SL: "schedule.shift.short.sl",
  PL: "schedule.shift.short.pl",
  LWP: "schedule.shift.short.lwp",
};
function shortLabel(code: string, lang: Lang): string {
  const key = SHORT_KEY[code];
  return key ? t(lang, key) : code;
}

const WORK_CODES = [
  { code: "F", textKey: "schedule.shift.work.f" }, { code: "M", textKey: "schedule.shift.work.m" },
  { code: "A", textKey: "schedule.shift.work.a" }, { code: "FH", textKey: "schedule.shift.work.fh" },
  { code: "OFF", textKey: "schedule.shift.work.off" },
];
const LEAVE_CODES = [
  { code: "AL", textKey: "schedule.shift.leave.al" }, { code: "PL", textKey: "schedule.shift.leave.pl" },
  { code: "SL", textKey: "schedule.shift.leave.sl" }, { code: "PH", textKey: "schedule.shift.leave.ph" },
];

function addMonth(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + delta;
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
}
const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
function monthLabel(month: string, lang: Lang): string {
  const [y, m] = month.split("-").map(Number);
  const name = t(lang, `schedule.months.${MONTH_KEYS[m - 1]}`);
  const year = lang === "th" ? y + 543 : y; // ปีพุทธศักราชเฉพาะภาษาไทย
  return `${name} ${year}`;
}
function daysInMonth(month: string): string[] {
  const y = Number(month.slice(0, 4)), m = Number(month.slice(5, 7));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: last }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`);
}

export default function SchedulePage() {
  const me = useMe();
  const lang = useLang();
  const scoped = !!me && me.branchScope !== "all";
  const canEdit = me?.role === "admin" || !!me?.isSenior;
  const [branch, setBranch] = React.useState<Branch>("NVP");
  const [month, setMonth] = React.useState<string>(() => todayISO().slice(0, 7));
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [reqs, setReqs] = React.useState<any[]>([]);
  const [err, setErr] = React.useState<string | null>(null);
  const [pick, setPick] = React.useState<{ name: string; date: string; code: string } | null>(null);
  const [msg, setMsg] = React.useState<{ tone: "ok" | "warn"; title: string; body?: string } | null>(null);

  React.useEffect(() => { if (scoped) setBranch(me!.branchScope as Branch); }, [scoped, me]);

  const load = React.useCallback(() => {
    setErr(null);
    fetch(`/api/schedules?branch=${branch}&month=${month}`)
      .then((r) => r.json())
      .then((d) => (d?.error ? setErr(d.error) : setRows(d.rows ?? [])))
      .catch((e) => setErr(String(e?.message ?? e)));
    if (canEdit) {
      fetch(`/api/schedule-requests?branch=${branch}`)
        .then((r) => r.json())
        .then((d) => setReqs((d.rows ?? []).filter((x: any) => x.status === "pending")))
        .catch(() => {});
    }
  }, [branch, month, canEdit]);
  React.useEffect(() => { setRows(null); load(); }, [load]);

  const days = React.useMemo(() => daysInMonth(month), [month]);
  const names = React.useMemo(
    () => [...new Set((rows ?? []).map((r) => r.employeeName))].sort((a, b) => a.localeCompare(b, "th")),
    [rows]
  );
  const cellOf = React.useMemo(() => {
    const m = new Map<string, Row>();
    for (const r of rows ?? []) m.set(`${r.employeeName}|${r.workDate}`, r);
    return m;
  }, [rows]);

  const summary = React.useMemo(() => names.map((n) => {
    let work = 0, off = 0, leave = 0;
    for (const d of days) {
      const c = cellOf.get(`${n}|${d}`)?.shiftCode;
      if (!c) continue;
      if (WORKING.has(c)) work += 1;
      else if (c === "OFF" || c === "CLOSED" || c === "PH") off += 1;
      else leave += 1;
    }
    return { name: n, work, off, leave };
  }), [names, days, cellOf]);

  const today = todayISO();

  async function apply(code: string, asLeaveRequest: boolean) {
    if (!pick) return;
    const reason = window.prompt(
      asLeaveRequest ? t(lang, "schedule.picker.promptLeaveReason") : t(lang, "schedule.picker.promptEditReason")
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      setMsg({ tone: "warn", title: t(lang, "schedule.picker.reasonRequiredTitle"), body: t(lang, "schedule.picker.reasonRequiredBody") });
      return;
    }
    try {
      const res = asLeaveRequest
        ? await fetch("/api/schedule-requests", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ branch, workDate: pick.date, employeeName: pick.name, kind: "leave", leaveCode: code, reason }),
          })
        : await fetch("/api/schedules", {
            method: "PATCH", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ branch, workDate: pick.date, employeeName: pick.name, shiftCode: code, reason }),
          });
      const d = await res.json();
      if (!res.ok || d?.error) throw new Error(d?.error ?? t(lang, "schedule.picker.errSaveFailed"));
      setPick(null);
      setMsg({
        tone: "ok",
        title: d.downgraded ? t(lang, "schedule.picker.savedDowngradedTitle") : t(lang, "schedule.picker.savedTitle"),
        body: !d.downgraded && d.remaining !== undefined ? t(lang, "schedule.picker.remainingLeaveBody", { n: d.remaining }) : undefined,
      });
      load();
    } catch (e: any) {
      setMsg({ tone: "warn", title: t(lang, "schedule.picker.saveFailedTitle"), body: e?.message });
    }
  }

  async function decide(id: number, approve: boolean) {
    try {
      const res = await fetch("/api/schedule-requests/decide", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, approve, note: approve ? "" : t(lang, "schedule.requests.reject") }),
      });
      const d = await res.json();
      if (!res.ok || d?.error) throw new Error(d?.error ?? t(lang, "schedule.requests.actionFailedTitle"));
      setMsg({ tone: "ok", title: approve ? t(lang, "schedule.requests.approvedTitle") : t(lang, "schedule.requests.rejectedTitle") });
      load();
    } catch (e: any) {
      setMsg({ tone: "warn", title: t(lang, "schedule.requests.actionFailedTitle"), body: e?.message });
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 pb-16">
      <PageTitle title={t(lang, "nav.account.schedule")} right={<Badge tone="blue">{monthLabel(month, lang)}</Badge>} />

      <div className="glass mb-2.5 p-2.5">
        <div className="grid gap-2">
          <BranchPicker value={branch} onChange={setBranch} locked={scoped} />
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMonth((m) => addMonth(m, -1))}
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[12.5px] font-medium">{t(lang, "schedule.monthNav.prev")}</button>
            <span className="flex-1 text-center text-[13px] font-semibold">{monthLabel(month, lang)}</span>
            <button type="button" onClick={() => setMonth((m) => addMonth(m, 1))}
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[12.5px] font-medium">{t(lang, "schedule.monthNav.next")}</button>
          </div>
        </div>
      </div>

      {msg && (
        <Dialog open tone={msg.tone} title={msg.title} actionLabel={t(lang, "schedule.picker.close")} onClose={() => setMsg(null)}>
          {msg.body}
        </Dialog>
      )}

      {/* แตะช่องไหนก็เปิดกล่องนี้ — ไม่ต้องเลือกคนกับวันที่ซ้ำอีกรอบ */}
      {pick && (
        <div className="fixed inset-0 z-[60] flex items-end bg-black/40 px-3 pb-3 backdrop-blur-[2px]"
          onClick={() => setPick(null)}>
          <div className="w-full rounded-2xl bg-white/95 px-4 pb-5 pt-4 shadow-glass" onClick={(e) => e.stopPropagation()}>
            <p className="text-[15px] font-semibold">{pick.name}</p>
            <p className="mb-3 text-[12px] text-brand-ink/55">
              {thaiDate(pick.date)} · {t(lang, "schedule.picker.nowPrefix")}{pick.code ? shortLabel(pick.code, lang) : t(lang, "schedule.picker.noSchedule")}
            </p>

            {canEdit ? (
              <>
                <p className="mb-1.5 text-[11px] uppercase tracking-wide text-brand-ink/45">{t(lang, "schedule.picker.changeToShift")}</p>
                <div className="mb-3 grid grid-cols-5 gap-1.5">
                  {WORK_CODES.map((o) => (
                    <button key={o.code} type="button" onClick={() => apply(o.code, false)}
                      className={`rounded-xl px-1 py-2.5 text-[11.5px] font-semibold ${CELL[o.code]}`}>{t(lang, o.textKey)}</button>
                  ))}
                </div>
                <p className="mb-1.5 text-[11px] uppercase tracking-wide text-brand-ink/45">{t(lang, "schedule.picker.saveAsLeave")}</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {LEAVE_CODES.map((o) => (
                    <button key={o.code} type="button" onClick={() => apply(o.code, false)}
                      className={`rounded-xl px-1 py-2.5 text-[11.5px] font-semibold ${CELL[o.code]}`}>{t(lang, o.textKey)}</button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="mb-1.5 text-[11px] uppercase tracking-wide text-brand-ink/45">{t(lang, "schedule.picker.requestLeaveToday")}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" onClick={() => apply("AL", true)}
                    className={`rounded-xl px-2 py-3 text-[13px] font-semibold ${CELL.AL}`}>{t(lang, "schedule.shift.leave.al")}</button>
                  <button type="button" onClick={() => apply("PL", true)}
                    className={`rounded-xl px-2 py-3 text-[13px] font-semibold ${CELL.PL}`}>{t(lang, "schedule.shift.leave.pl")}</button>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-brand-ink/45">
                  {t(lang, "schedule.picker.sickSwapHint")}
                </p>
              </>
            )}

            <button type="button" onClick={() => setPick(null)}
              className="mt-3 w-full rounded-xl px-4 py-2.5 text-[13px] font-medium text-brand-ink/55">{t(lang, "schedule.picker.close")}</button>
          </div>
        </div>
      )}

      {canEdit && reqs.length > 0 && (
        <GlassCard className="mb-3">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-brand-ink/45">{t(lang, "schedule.requests.pendingTitle", { n: reqs.length })}</p>
          <div className="grid gap-2">
            {reqs.map((r) => (
              <div key={r.id} className="rounded-lg bg-white/70 px-2.5 py-2">
                <p className="text-[12.5px] font-medium">{r.employeeName} ↔ {r.swapWith} · {thaiDate(r.workDate)}</p>
                <p className="text-[11.5px] text-brand-ink/55">{r.reason} — {t(lang, "schedule.requests.requestedByPrefix")}{r.requestedBy}</p>
                <div className="mt-1.5 flex gap-1.5">
                  <button type="button" onClick={() => decide(r.id, true)}
                    className="flex-1 rounded-lg bg-ok px-3 py-1.5 text-[12px] font-semibold text-white">{t(lang, "schedule.requests.approve")}</button>
                  <button type="button" onClick={() => decide(r.id, false)}
                    className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[12px] font-medium">{t(lang, "schedule.requests.reject")}</button>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {err && <GlassCard className="mb-3"><p className="text-sm text-warn">{err}</p></GlassCard>}

      {rows === null ? (
        <GlassCard><p className="text-sm text-brand-ink/50">{t(lang, "common.loading")}</p></GlassCard>
      ) : names.length === 0 ? (
        <GlassCard>
          <p className="text-[13.5px] font-medium">{t(lang, "schedule.table.emptyMonthTitle")}</p>
          <p className="mt-0.5 text-[11.5px] text-brand-ink/55">{t(lang, "schedule.table.emptyMonthHint")}</p>
        </GlassCard>
      ) : (
        <>
          {/* ตาราง คน × วัน — เลื่อนแนวนอนได้ ชื่อคนตรึงไว้ซ้ายมือ */}
          <div className="glass mb-2 overflow-x-auto p-2">
            <table className="border-separate border-spacing-[2px] text-[11px]">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-white/90 px-1.5 py-1 text-left text-[10px] font-medium text-brand-ink/45">
                    {t(lang, "schedule.table.dateColumnHeader")}
                  </th>
                  {days.map((d) => {
                    const dt = new Date(d + "T00:00:00Z");
                    const isToday = d === today;
                    return (
                      <th key={d} className={`min-w-[32px] px-0.5 py-1 text-center text-[9.5px] font-medium leading-tight ${
                        isToday ? "text-brand-red" : "text-brand-ink/45"}`}>
                        {t(lang, `schedule.dow.${DOW_KEYS[dt.getUTCDay()]}`)}<br /><span className="text-[11px]">{dt.getUTCDate()}</span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {names.map((n) => (
                  <tr key={n}>
                    <td className="sticky left-0 z-10 whitespace-nowrap bg-white/90 px-1.5 py-1 text-[11.5px] font-medium">
                      {n.split(" ")[0]}
                    </td>
                    {days.map((d) => {
                      const c = cellOf.get(`${n}|${d}`)?.shiftCode;
                      const isToday = d === today;
                      return (
                        <td key={d} className="p-0">
                          <button
                            type="button"
                            onClick={() => setPick({ name: n, date: d, code: c ?? "" })}
                            className={`h-7 w-full rounded text-[9px] font-semibold leading-none ${
                              c ? CELL[c] ?? "bg-black/5" : "bg-black/[.02] text-brand-ink/20"
                            } ${isToday ? "ring-1 ring-brand-red/60" : ""}`}
                          >
                            {c ? shortLabel(c, lang) : "–"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mb-3 px-1 text-[11px] leading-relaxed text-brand-ink/50">
            {canEdit
              ? t(lang, "schedule.table.hintEditable")
              : t(lang, "schedule.table.hintReadonly")}
          </p>

          <GlassCard>
            <p className="mb-2 text-[11px] uppercase tracking-wide text-brand-ink/45">{t(lang, "schedule.summary.title")}</p>
            <div className="grid gap-1.5">
              {summary.map((s) => (
                <div key={s.name} className="flex items-center justify-between gap-2 rounded-lg bg-white/60 px-2.5 py-1.5">
                  <span className="text-[13px] font-medium">{s.name}</span>
                  <span className="text-[11.5px] tabular-nums text-brand-ink/55">
                    {t(lang, "schedule.summary.work")} <b className="text-[13px] text-brand-ink">{s.work}</b> ·
                    {t(lang, "schedule.summary.off")} <b className="text-[13px] text-brand-ink">{s.off}</b>
                    {s.leave > 0 && <> · {t(lang, "schedule.summary.leave")} <b className="text-[13px] text-brand-red">{s.leave}</b></>}
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}
