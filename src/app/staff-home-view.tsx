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
import { useMe } from "@/components/nav";

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

const MARK: Record<HomeTask["status"], { cls: string; label: string; text: string }> = {
  done: { cls: "bg-ok text-white border-ok", label: "✓", text: "มีคนทำไปแล้ว" },
  due: { cls: "bg-warn/15 text-warn border-warn/30", label: "!", text: "ต้องทำวันนี้" },
  todo: { cls: "border-black/15 text-brand-ink/35", label: "", text: "ยังไม่ได้ทำ" },
};

// ── ตารางงานวันนี้ ──
// ไม่ขึ้นอะไรเลยถ้าวันนั้นยังไม่มีตารางในระบบ (เช่นเลยรอบ 25 ส.ค. ไปแล้วแต่ยังไม่ได้ใส่รอบใหม่)
// ดีกว่าขึ้นกล่องว่าง ๆ ให้พนักงานสงสัยว่าระบบพัง
function TodaySchedule({ branch, date }: { branch: string; date: string }) {
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
      <p className="mb-2 text-[11px] uppercase tracking-wide text-brand-ink/45">ตารางงานวันนี้</p>
      {working.length === 0 ? (
        <p className="text-[13px] font-medium text-warn">วันนี้ไม่มีใครเข้ากะที่สาขานี้</p>
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
    if (!window.confirm("ฝากของส่งคืนขึ้นรถเรียบร้อยแล้วใช่ไหม?\n\nกดตกลงแล้วรายการนี้จะหายไปจากหน้าหลัก")) return;
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
    return <p className="py-10 text-center text-sm text-brand-ink/50">กำลังโหลด…</p>;
  }

  const allDone = data.remaining === 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-20">
      <div className="mb-3">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-[19px] font-semibold leading-tight">{thaiDate(data.date)}</p>
          <Badge tone="blue">สาขา {data.branch}</Badge>
        </div>
        {me?.name && <p className="mt-0.5 text-[14px] font-medium text-brand-ink/60">{me.name}</p>}
      </div>

      {/* ตารางงานวันนี้ (v1.26) — ใครเข้ากะอะไรที่สาขานี้ · อ่านจากตารางกะที่ import มาจากไฟล์ของแพร */}
      <TodaySchedule branch={data.branch} date={data.date} />

      <GlassCard className="mb-3">
        {allDone ? (
          <p className="text-[19px] font-semibold leading-tight text-ok">งานวันนี้ครบแล้ว</p>
        ) : (
          <p className="text-[19px] font-semibold leading-tight">
            เหลืออีก <span className="text-brand-red">{data.remaining}</span> อย่างที่ยังไม่ได้ทำ
          </p>
        )}
        <p className="mt-0.5 text-[11.5px] text-brand-ink/50">
          รายการที่ต้องทำเป็นของทั้งสาขา — เพื่อนทำไปแล้วจะขึ้นติ๊กเขียวให้เอง
        </p>
      </GlassCard>

      {returns.length > 0 && (
        <div className="mb-3 rounded-2xl border border-brand-orange/45 bg-brand-orange/[.1] px-3.5 py-3">
          <p className="text-[17px] font-bold leading-tight text-orange-700">วันนี้มีของส่งคืน</p>
          <p className="mt-0.5 text-[12px] font-medium text-brand-ink/70">
            อย่าลืมฝากสินค้ากลับไปกับรถส่งของ
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
            {sending ? "กำลังบันทึก…" : "ฝากขึ้นรถแล้ว"}
          </button>
        </div>
      )}

      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-brand-ink/45">รายการที่ต้องทำวันนี้</p>

      <div className="mb-3 grid gap-2">
        {data.tasks.map((t) => {
          const m = MARK[t.status];
          return (
            <Link
              key={t.key}
              href={t.href}
              className="flex items-center gap-3 rounded-xl border border-black/[.07] bg-white/70 px-3.5 py-3 transition hover:bg-white"
            >
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[12px] font-bold ${m.cls}`}>
                {m.label}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block text-[14px] font-medium ${t.status === "done" ? "text-brand-ink/45" : ""}`}>
                  {t.label}
                </span>
                <span className="block text-[11px] text-brand-ink/45">{t.hint ?? m.text}</span>
              </span>
              <span className="shrink-0 text-brand-ink/25">›</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
