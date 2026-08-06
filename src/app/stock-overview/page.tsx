"use client";
// สรุปสต็อกคงเหลือล่าสุด เทียบทุกสาขาในตารางเดียว (admin เท่านั้น) — แพรขอ 2026-08-06
// อ่านอย่างเดียว ไม่มีการแก้ไข — ใช้ดูภาพรวมเร็ว ๆ โดยไม่ต้องสลับ BranchPicker ทีละสาขา
import React from "react";
import type { Branch } from "@/lib/types";
import { GlassCard, PageTitle, Badge } from "@/components/ui";
import { todayISO, thaiDate } from "@/lib/fmt";

type OverviewRow = {
  itemId: string;
  name: string;
  category: string;
  unit: string;
  hasRemainder: boolean;
  byBranch: Record<string, { remainPack: number; remainG: number } | null>;
};

function fmtCell(v: { remainPack: number; remainG: number } | null, hasRemainder: boolean): string {
  if (!v) return "—";
  return hasRemainder && v.remainG ? `${v.remainPack} +${v.remainG}g` : `${v.remainPack}`;
}

export default function StockOverviewPage() {
  const [date, setDate] = React.useState(todayISO());
  const [rows, setRows] = React.useState<OverviewRow[] | null>(null);
  const [branches, setBranches] = React.useState<Branch[]>([]);
  const [forbidden, setForbidden] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(async (d: string) => {
    setErr(null);
    try {
      const res = await fetch(`/api/stock-overview?date=${d}`);
      if (res.status === 403) { setForbidden(true); setRows([]); return; }
      const data = (await res.json()) as { rows?: OverviewRow[]; branches?: Branch[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "โหลดไม่สำเร็จ");
      setForbidden(false);
      setRows(data.rows ?? []);
      setBranches(data.branches ?? []);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }, []);
  React.useEffect(() => { load(date); }, [load, date]);

  const groups = React.useMemo(() => {
    const map = new Map<string, OverviewRow[]>();
    (rows ?? []).forEach((r) => {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    });
    return Array.from(map.entries());
  }, [rows]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-4 pb-24">
      <PageTitle title="สรุปสต็อกคงเหลือ" right={<Badge tone="blue">{thaiDate(date)}</Badge>} />

      {forbidden ? (
        <GlassCard><p className="text-sm text-warn">เฉพาะ Admin เท่านั้น</p></GlassCard>
      ) : (
        <>
          <GlassCard className="mb-3">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-brand-ink/50">วันที่</span>
              <input
                type="date" value={date} max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-black/10 bg-white/70 px-2.5 py-1.5 text-sm"
              />
              {date !== todayISO() && (
                <span className="text-[11px] font-medium text-warn">⚠️ ไม่ใช่วันนี้</span>
              )}
            </div>
          </GlassCard>

          {err && <GlassCard className="mb-3"><p className="text-sm text-warn">{err}</p></GlassCard>}

          {!rows ? (
            <GlassCard><p className="text-sm text-brand-ink/50">กำลังโหลด…</p></GlassCard>
          ) : rows.length === 0 ? (
            <GlassCard><p className="text-sm text-brand-ink/50">ไม่มีรายการ</p></GlassCard>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-black/5">
              <div className="min-w-[420px]">
                <div
                  className="grid items-center gap-1 bg-black/5 px-2 py-1.5 text-[10px] font-medium text-brand-ink/50"
                  style={{ gridTemplateColumns: `1fr repeat(${branches.length}, 60px)` }}
                >
                  <span>รายการ</span>
                  {branches.map((b) => <span key={b} className="text-right">{b}</span>)}
                </div>
                {groups.map(([category, items]) => (
                  <React.Fragment key={category}>
                    <div className="bg-brand-orange/10 px-2 py-1 text-[10.5px] font-semibold text-brand-ink/70">
                      {category}
                    </div>
                    {items.map((r, i) => (
                      <div
                        key={r.itemId}
                        className={`grid items-center gap-1 px-2 py-1.5 text-[11.5px] ${i % 2 ? "bg-white/30" : "bg-white/50"}`}
                        style={{ gridTemplateColumns: `1fr repeat(${branches.length}, 60px)` }}
                      >
                        <span className="truncate">{r.name}</span>
                        {branches.map((b) => (
                          <span key={b} className="text-right tabular-nums">{fmtCell(r.byBranch[b], r.hasRemainder)}</span>
                        ))}
                      </div>
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
