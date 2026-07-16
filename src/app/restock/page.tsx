"use client";
// M2 · Restock (ต้องเติม) — รอบเติมของแยกวัน/สาขา (P0-8, P0-10)
import React from "react";
import { GlassCard, Segmented, BranchPicker, Badge, PageTitle } from "@/components/ui";
import { useMe } from "@/components/nav";
import type { Branch, Weekday, RestockRow } from "@/lib/types";
import { specialDayLabel } from "@/lib/calc";

const DAY_LABEL: Record<Weekday, string> = { wed: "วันพุธ", sat: "วันเสาร์" };
const DAY_OPTS = [
  { value: "wed" as Weekday, label: "วันพุธ" },
  { value: "sat" as Weekday, label: "วันเสาร์" },
];

export default function RestockPage() {
  const me = useMe();
  const scoped = !!me && me.branchScope !== "all";
  const [branch, setBranch] = React.useState<Branch>("NVP");
  const [day, setDay] = React.useState<Weekday>("wed");

  React.useEffect(() => {
    if (scoped) setBranch(me!.branchScope as Branch);
  }, [scoped, me]);
  const [rows, setRows] = React.useState<RestockRow[]>([]);
  const [specialActive, setSpecialActive] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/restock?branch=${branch}&day=${day}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "โหลดข้อมูลไม่สำเร็จ");
        return data as { rows: RestockRow[]; specialActive: boolean };
      })
      .then((data) => {
        if (!alive) return;
        setRows(data.rows);
        setSpecialActive(data.specialActive);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
        setRows([]);
        setSpecialActive(false);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branch, day]);

  const dayLabel = DAY_LABEL[day];
  const ownSpecialDay = specialDayLabel(branch); // string | null — null = สาขานี้ยังไม่มีรอบ special

  return (
    <div>
      <PageTitle title="เติมของ (ต้องเติม)" />

      <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <BranchPicker value={branch} onChange={setBranch} locked={scoped} />
        <Segmented options={DAY_OPTS} value={day} onChange={setDay} />
      </div>

      <GlassCard>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">
            รอบเติม · {dayLabel} · {branch}
          </h2>
          <span className="shrink-0 text-xs text-brand-ink/50">{rows.length} รายการ</span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-brand-ink/50">กำลังโหลด…</div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-warn">{error}</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-brand-ink/50">ไม่มีรายการในรอบนี้</div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-black/5">
            {/* header */}
            <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 bg-black/5 px-3 py-2 text-[11px] font-medium text-brand-ink/50">
              <span>รายการ</span>
              <span className="w-10 text-right">Par</span>
              <span className="w-12 text-right">คงเหลือ</span>
              <span className="w-12 text-right">ต้องเติม</span>
            </div>
            {/* rows */}
            {rows.map((r, i) => (
              <div
                key={r.itemId}
                className={`grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 px-3 py-2.5 text-sm ${
                  i % 2 ? "bg-white/30" : "bg-white/50"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{r.name}</span>
                  {r.isSpecial && <Badge tone="orange">special</Badge>}
                </span>
                <span className="w-10 text-right tabular-nums text-brand-ink/70">{r.par}</span>
                <span className="w-12 text-right tabular-nums text-brand-ink/70">{r.remain}</span>
                <span className="w-12 text-right font-semibold tabular-nums">
                  {r.need != null && r.need > 0 ? (
                    <span className="text-warn">+{r.need}</span>
                  ) : (
                    <span className="text-brand-ink/40">✓</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        )}

        {!loading && !error && (
          <p className="mt-3 text-xs leading-relaxed text-brand-ink/60">
            {specialActive
              ? `รอบนี้รวม 7 รายการ special (${branch} เข้า${dayLabel})`
              : ownSpecialDay
                ? `รอบนี้ไม่มี 7 รายการ special — ${branch} รับ special เฉพาะวัน${ownSpecialDay}`
                : `สาขา ${branch} ยังไม่เปิดรับ 7 รายการ special (รอกำหนดรอบเติมของ)`}
          </p>
        )}
      </GlassCard>

      <p className="mt-3 px-1 text-xs text-brand-ink/45">ต้องเติม = MAX(Par − คงเหลือ, 0)</p>
    </div>
  );
}
