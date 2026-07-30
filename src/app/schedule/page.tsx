"use client";
// v1.27 · ตารางงาน — พนักงานดูตารางของสาขาตัวเองได้ทั้งเดือน
//
// ขั้นที่ 1 ของ 3 (ดูตาราง → ขอสลับ/ขอลา → ด่านเช็คกติกา + แจ้งแอดมิน)
// จัดเป็น "เดือนปฏิทิน" ไม่ใช่รอบเงินเดือน 26–25 (แพรระบุ) — รอบเงินเดือนใช้ตอนคิดเงินซึ่งอยู่นอกแอปนี้
import React from "react";
import { GlassCard, PageTitle, Badge, BranchPicker } from "@/components/ui";
import { useMe } from "@/components/nav";
import { thaiDate, todayISO } from "@/lib/fmt";
import type { Branch, ScheduleRow } from "@/lib/types";

type Row = ScheduleRow & { workDate: string };

const DOW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
// สีของกะ — สื่อความหมายเดียวกับไฟล์ Roster ที่ทีมใช้กันอยู่ (ส้ม=เต็มวัน เหลือง=ครึ่งวัน เทา=หยุด)
const TONE: Record<string, string> = {
  F: "bg-brand-orange/25 text-orange-800",
  M: "bg-brand-blue/30 text-sky-800",
  A: "bg-ok/15 text-ok",
  SH: "bg-warn/15 text-warn",
  OFF: "bg-black/[.06] text-brand-ink/45",
  CLOSED: "bg-black/[.06] text-brand-ink/35",
  PH: "bg-brand-red/15 text-brand-red",
  AL: "bg-brand-red/10 text-brand-red",
  SL: "bg-brand-red/10 text-brand-red",
  PL: "bg-brand-red/10 text-brand-red",
  LWP: "bg-brand-red/10 text-brand-red",
  PT: "bg-brand-blue/20 text-sky-800",
};
const WORKING = new Set(["F", "M", "A", "SH", "PT"]);

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}
function addMonth(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) - 1 + delta;
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 7);
}
function thaiMonthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const names = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${names[m - 1]} ${y + 543}`;
}

export default function SchedulePage() {
  const me = useMe();
  const scoped = !!me && me.branchScope !== "all";
  const [branch, setBranch] = React.useState<Branch>("NVP");
  const [month, setMonth] = React.useState<string>(() => monthOf(todayISO()));
  const [rows, setRows] = React.useState<Row[] | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (scoped) setBranch(me!.branchScope as Branch);
  }, [scoped, me]);

  React.useEffect(() => {
    let alive = true;
    setRows(null);
    setErr(null);
    fetch(`/api/schedules?branch=${branch}&month=${month}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.error) { setErr(d.error); return; }
        setRows(d.rows ?? []);
      })
      .catch((e) => { if (alive) setErr(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, [branch, month]);

  // จัดกลุ่มตามวัน — ตารางอ่านตามวันง่ายกว่าตามคน สำหรับพนักงานที่มาดูว่า "วันนี้ใครอยู่บ้าง"
  const byDate = React.useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows ?? []) {
      const cur = map.get(r.workDate) ?? [];
      cur.push(r);
      map.set(r.workDate, cur);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  // สรุปรายคนทั้งเดือน — วันทำงานกี่วัน หยุดกี่วัน ลากี่วัน
  const perPerson = React.useMemo(() => {
    const map = new Map<string, { work: number; off: number; leave: number }>();
    for (const r of rows ?? []) {
      const cur = map.get(r.employeeName) ?? { work: 0, off: 0, leave: 0 };
      if (WORKING.has(r.shiftCode)) cur.work += 1;
      else if (r.shiftCode === "OFF" || r.shiftCode === "CLOSED" || r.shiftCode === "PH") cur.off += 1;
      else cur.leave += 1;
      map.set(r.employeeName, cur);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "th"));
  }, [rows]);

  const today = todayISO();

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-16">
      <PageTitle title="ตารางงาน" right={<Badge tone="blue">{thaiMonthLabel(month)}</Badge>} />

      <div className="glass mb-2.5 p-2.5">
        <div className="grid gap-2">
          <BranchPicker value={branch} onChange={setBranch} locked={scoped} />
          <div className="flex items-center gap-2">
            <button
              type="button" onClick={() => setMonth((m) => addMonth(m, -1))}
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[12.5px] font-medium"
            >
              ← เดือนก่อน
            </button>
            <span className="flex-1 text-center text-[13px] font-semibold">{thaiMonthLabel(month)}</span>
            <button
              type="button" onClick={() => setMonth((m) => addMonth(m, 1))}
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-[12.5px] font-medium"
            >
              เดือนหน้า →
            </button>
          </div>
        </div>
      </div>

      {err && <GlassCard className="mb-3"><p className="text-sm text-warn">{err}</p></GlassCard>}

      {rows === null ? (
        <GlassCard><p className="text-sm text-brand-ink/50">กำลังโหลด…</p></GlassCard>
      ) : rows.length === 0 ? (
        <GlassCard>
          <p className="text-[13.5px] font-medium">ยังไม่มีตารางของเดือนนี้</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-brand-ink/55">
            แอดมินหรือ senior staff เป็นคนจัดตาราง — เดือนที่ยังไม่ได้จัดจะว่างแบบนี้
          </p>
        </GlassCard>
      ) : (
        <>
          {/* สรุปรายคนทั้งเดือน */}
          <GlassCard className="mb-3">
            <p className="mb-2 text-[11px] uppercase tracking-wide text-brand-ink/45">สรุปทั้งเดือน</p>
            <div className="grid gap-1.5">
              {perPerson.map(([name, c]) => (
                <div key={name} className="flex items-center justify-between gap-2 rounded-lg bg-white/60 px-2.5 py-1.5">
                  <span className="text-[13px] font-medium">{name}</span>
                  <span className="text-[11.5px] tabular-nums text-brand-ink/55">
                    ทำงาน <b className="text-[13px] text-brand-ink">{c.work}</b> ·
                    หยุด <b className="text-[13px] text-brand-ink">{c.off}</b>
                    {c.leave > 0 && <> · ลา <b className="text-[13px] text-brand-red">{c.leave}</b></>}
                  </span>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* รายวัน */}
          <div className="grid gap-1.5">
            {byDate.map(([date, list]) => {
              const d = new Date(date + "T00:00:00Z");
              const isToday = date === today;
              const working = list.filter((r) => WORKING.has(r.shiftCode));
              return (
                <div
                  key={date}
                  className={`rounded-xl border px-3 py-2 ${
                    isToday ? "border-brand-red/40 bg-brand-red/[.06]" : "border-black/[.06] bg-white/60"
                  }`}
                >
                  <div className="mb-1 flex items-baseline gap-2">
                    <span className="text-[13px] font-semibold tabular-nums">
                      {DOW[d.getUTCDay()]} {d.getUTCDate()}
                    </span>
                    {isToday && <span className="text-[10.5px] font-medium text-brand-red">วันนี้</span>}
                    {working.length === 0 && (
                      <span className="text-[10.5px] font-medium text-brand-ink/40">ไม่มีใครเข้ากะ</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {list.map((r) => (
                      <span
                        key={r.employeeName}
                        className={`rounded-lg px-2 py-1 text-[11.5px] leading-tight ${TONE[r.shiftCode] ?? "bg-black/5"}`}
                        title={r.startTime ? `${r.shiftLabel} ${r.startTime}–${r.endTime}` : r.shiftLabel}
                      >
                        {r.employeeName}
                        <span className="ml-1 opacity-70">
                          {r.startTime ? `${r.startTime}–${r.endTime}` : r.shiftLabel}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="mt-3 px-1 text-[11px] leading-relaxed text-brand-ink/45">
            ตอนนี้ดูได้อย่างเดียว — การขอสลับวันหยุด/ขอลา และการแก้ตารางของ senior staff กำลังทำต่อ
          </p>
        </>
      )}
    </div>
  );
}
