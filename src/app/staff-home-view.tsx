"use client";
// v1.14 · หน้าหลักของพนักงาน — "วันนี้ต้องทำอะไรบ้าง"
//
// เช็คลิสต์นี้เป็นของ "สาขา" ไม่ใช่ของแต่ละคน — ข้อมูลทุกอย่างผูกกับ (สาขา, วันที่)
// A ยืนยันรับของแล้ว B เปิดมาก็เห็นว่าติ๊กแล้ว ไม่ต้องทำซ้ำ
import React from "react";
import Link from "next/link";
import { GlassCard, PageTitle, Badge } from "@/components/ui";
import { baht, thaiDate } from "@/lib/fmt";

interface HomeTask {
  key: string;
  label: string;
  href: string;
  status: "done" | "todo" | "due";
  hint?: string;
}
interface HomeResp {
  branch: string;
  date: string;
  tasks: HomeTask[];
  remaining: number;
  salesYesterday: number;
  error?: string;
}

const MARK: Record<HomeTask["status"], { cls: string; label: string; text: string }> = {
  done: { cls: "bg-ok/15 text-ok border-ok/25", label: "✓", text: "เสร็จแล้ว" },
  due: { cls: "bg-warn/15 text-warn border-warn/30", label: "!", text: "ต้องทำวันนี้" },
  todo: { cls: "border-black/15 text-brand-ink/35", label: "", text: "ยังไม่ได้ทำ" },
};

export function StaffHome() {
  const [data, setData] = React.useState<HomeResp | null>(null);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    fetch("/api/home")
      .then((r) => r.json())
      .then((d: HomeResp) => (d.error ? setErr(d.error) : setData(d)))
      .catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  React.useEffect(() => { load(); }, [load]);
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
        <PageTitle title="หน้าหลัก" />
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
      <PageTitle title="หน้าหลัก" right={<Badge tone="blue">สาขา {data.branch}</Badge>} />

      <GlassCard className="mb-3">
        <p className="text-[11px] text-brand-ink/50">{thaiDate(data.date)}</p>
        {allDone ? (
          <p className="mt-1 text-[19px] font-semibold leading-tight text-ok">งานวันนี้ครบแล้ว</p>
        ) : (
          <p className="mt-1 text-[19px] font-semibold leading-tight">
            เหลืออีก <span className="text-brand-red">{data.remaining}</span> อย่างที่ยังไม่ได้ทำ
          </p>
        )}
        <p className="mt-0.5 text-[11.5px] text-brand-ink/50">
          เช็คลิสต์นี้เป็นของทั้งสาขา — เพื่อนทำไปแล้วจะขึ้นติ๊กให้เอง
        </p>
      </GlassCard>

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

      <GlassCard>
        <p className="text-[11px] text-brand-ink/50">ยอดขายเมื่อวาน</p>
        <p className="text-[26px] font-semibold leading-tight tabular-nums">{baht(data.salesYesterday)}</p>
      </GlassCard>
    </div>
  );
}
