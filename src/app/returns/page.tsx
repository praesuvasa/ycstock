"use client";
// ข้อ 7 · ประวัติส่งคืน / ของเสีย — read-only ล้วน ไม่มีการบันทึกที่หน้านี้
// ข้อมูลมาจากช่อง "ส่งคืน/เสีย" ที่พนักงานกรอกในหน้าสต็อกอยู่แล้ว (ไม่ต้องกรอกซ้ำ ไม่มีงานเพิ่ม)
// สิทธิ์: พนักงานเห็นเฉพาะสาขาตัวเอง (บังคับที่ฝั่ง API ไม่ใช่แค่ซ่อนปุ่ม) · admin เลือกสาขาได้/ดูรวมทุกสาขาได้
import React from "react";
import type { Branch, ReturnHistoryRow } from "@/lib/types";
import { useMe, useLang } from "@/components/nav";
import { GlassCard, PageTitle, Badge, Stat } from "@/components/ui";
import { todayISO, thaiDate } from "@/lib/fmt";
import { t } from "@/lib/i18n";

// ย้อนหลัง N วันจากวันที่กำหนด — ใช้ตั้งค่าเริ่มต้นช่วงวันที่ (ค่าเริ่มต้น 30 วันล่าสุด)
function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const RANGE_PRESETS: { labelKey: string; days: number }[] = [
  { labelKey: "returns.range7Days", days: 7 },
  { labelKey: "returns.range30Days", days: 30 },
  { labelKey: "returns.range90Days", days: 90 },
];

export default function ReturnsPage() {
  const me = useMe();
  const lang = useLang();
  const canPickBranch = !!me && me.branchScope === "all";

  const [branch, setBranch] = React.useState<Branch | "ALL">("ALL");
  const [from, setFrom] = React.useState<string>(daysAgoISO(30));
  const [to, setTo] = React.useState<string>(todayISO());

  const [rows, setRows] = React.useState<ReturnHistoryRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    const bq = canPickBranch && branch !== "ALL" ? `&branch=${branch}` : "";
    fetch(`/api/returns?from=${from}&to=${to}${bq}`)
      .then((r) => r.json())
      .then((data: { rows?: ReturnHistoryRow[]; error?: string }) => {
        if (!alive) return;
        if (data.error) { setError(data.error); setRows([]); return; }
        setRows(data.rows ?? []);
      })
      .catch((e) => { if (alive) setError(String(e?.message ?? e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [branch, from, to, canPickBranch]);

  // สรุป: รวมกี่ครั้ง · รายการที่ส่งคืนบ่อยสุด · สาขาที่ส่งคืนมากสุด (เฉพาะตอนดูรวมทุกสาขา)
  const summary = React.useMemo(() => {
    const byItem = new Map<string, number>();
    const byBranch = new Map<string, number>();
    let totalPack = 0;
    for (const r of rows) {
      totalPack += r.returned;
      byItem.set(r.itemName, (byItem.get(r.itemName) ?? 0) + r.returned);
      byBranch.set(r.branch, (byBranch.get(r.branch) ?? 0) + r.returned);
    }
    const topItems = Array.from(byItem.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topBranches = Array.from(byBranch.entries()).sort((a, b) => b[1] - a[1]);
    return { totalPack, topItems, topBranches };
  }, [rows]);

  // จัดกลุ่มตามวัน — อ่านง่ายกว่าตารางยาวๆ บนมือถือ
  const byDate = React.useMemo(() => {
    const m = new Map<string, ReturnHistoryRow[]>();
    for (const r of rows) {
      if (!m.has(r.date)) m.set(r.date, []);
      m.get(r.date)!.push(r);
    }
    return Array.from(m.entries()); // API เรียงวันใหม่สุดมาก่อนให้แล้ว
  }, [rows]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-24">
      <PageTitle
        title={t(lang, "nav.user.returnsHistory")}
        right={<span className="text-xs text-brand-ink/50">{t(lang, "returns.itemCountSuffix", { n: rows.length })}</span>}
      />

      <div className="mb-3 rounded-lg border border-black/10 bg-black/[.02] px-3 py-2.5 text-[12px] leading-relaxed text-brand-ink/60">
        {t(lang, "returns.infoBanner")}
        {!canPickBranch && t(lang, "returns.infoBannerBranchSuffix")}
      </div>

      <GlassCard className="mb-3">
        <div className="grid gap-3">
          {canPickBranch && (
            <div>
              <p className="mb-1 text-[11px] text-brand-ink/50">{t(lang, "returns.branchLabel")}</p>
              <div className="flex gap-1.5">
                {(["ALL", "SND", "NVP", "KCN"] as const).map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setBranch(b)}
                    className={`flex-1 rounded-xl px-2 py-2 text-[13px] font-medium transition ${
                      branch === b ? "bg-brand-red text-white" : "border border-black/10 bg-white/60 text-brand-ink"
                    }`}
                  >
                    {b === "ALL" ? t(lang, "returns.allBranches") : b}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-1.5">
            {RANGE_PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                onClick={() => { setFrom(daysAgoISO(p.days)); setTo(todayISO()); }}
                className="flex-1 rounded-lg border border-black/10 bg-white/60 px-2 py-1.5 text-[12px] font-medium text-brand-ink"
              >
                {t(lang, p.labelKey)}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[11px] text-brand-ink/50">{t(lang, "returns.fromLabel")}</span>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field" />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-[11px] text-brand-ink/50">{t(lang, "returns.toLabel")}</span>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field" />
            </label>
          </div>
        </div>
      </GlassCard>

      {!loading && !error && rows.length > 0 && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <Stat label={t(lang, "returns.totalReturnedPack")} value={`${summary.totalPack}`} tone={summary.totalPack > 0 ? "warn" : "default"} />
            <Stat label={t(lang, "returns.totalCount")} value={`${rows.length}`} />
          </div>

          <GlassCard className="mb-3">
            <p className="mb-2 text-[13px] font-semibold">{t(lang, "returns.topReturnedTitle")}</p>
            <div className="grid gap-1">
              {summary.topItems.map(([name, qty]) => (
                <div key={name} className="flex items-center justify-between gap-2 rounded-lg bg-black/[.02] px-2.5 py-1.5">
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{name}</span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-warn">{qty}</span>
                </div>
              ))}
            </div>
            {canPickBranch && branch === "ALL" && summary.topBranches.length > 1 && (
              <>
                <p className="mb-2 mt-3 text-[13px] font-semibold">{t(lang, "returns.byBranchTitle")}</p>
                <div className="flex gap-2">
                  {summary.topBranches.map(([b, qty]) => (
                    <div key={b} className="flex-1 rounded-lg bg-black/[.02] px-2.5 py-2 text-center">
                      <div className="text-[11px] text-brand-ink/50">{b}</div>
                      <div className="text-[16px] font-bold tabular-nums">{qty}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </GlassCard>
        </>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-brand-ink/50">{t(lang, "returns.loading")}</p>
      ) : error ? (
        <GlassCard><p className="py-6 text-center text-sm text-warn">{error}</p></GlassCard>
      ) : rows.length === 0 ? (
        <GlassCard>
          <p className="py-8 text-center text-sm text-brand-ink/50">
            {t(lang, "returns.emptyState")}
          </p>
        </GlassCard>
      ) : (
        <div className="grid gap-2">
          {byDate.map(([date, items]) => (
            <GlassCard key={date}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[13px] font-semibold">{thaiDate(date)}</span>
                <span className="text-[11px] text-brand-ink/45">{t(lang, "returns.itemCountSuffix", { n: items.length })}</span>
              </div>
              <div className="grid gap-1">
                {items.map((r, i) => (
                  <div key={`${r.branch}-${r.itemId}-${i}`} className="rounded-lg bg-black/[.02] px-2.5 py-1.5">
                    <div className="flex items-center gap-1.5">
                      {canPickBranch && branch === "ALL" && <Badge tone="blue">{r.branch}</Badge>}
                      <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium">{r.itemName}</span>
                      <span className="shrink-0 text-[13px] font-semibold tabular-nums text-warn">
                        {r.returned > 0 && `${r.returned} ${r.unit}`}
                        {r.returnedG > 0 && <span className="text-[11px]">{r.returned > 0 ? " + " : ""}{r.returnedG}g</span>}
                      </span>
                    </div>
                    {r.note && <p className="mt-0.5 truncate text-[10.5px] text-brand-ink/45">{r.note}</p>}
                  </div>
                ))}
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
