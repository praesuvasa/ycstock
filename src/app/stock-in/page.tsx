"use client";
// M3 · สินค้าเข้า — สรุปรายการที่ "รับเข้า" (inPack/inG) รายวัน ให้ user+admin ย้อนดูประวัติได้สะดวก
// ข้อมูลดึงจากช่อง "รับเข้า" ที่กรอกในหน้าสต็อกอยู่แล้ว (ไม่ต้องเก็บข้อมูลเพิ่ม) — ไม่มีการบันทึก หน้านี้ read-only ล้วน
import React from "react";
import type { Branch } from "@/lib/types";
import { useMe, useLang } from "@/components/nav";
import { GlassCard, BranchPicker, PageTitle, Accordion } from "@/components/ui";
import { todayISO, thaiDate } from "@/lib/fmt";
import { t, type Lang } from "@/lib/i18n";

interface StockInRow { itemId: string; name: string; category: string; unit: string; inPack: number; inG: number }
interface RecentDay { date: string; count: number }

// ใช้คีย์เดือน/วันร่วมกับ schedule.dow.* (ตัวย่อวันชุดเดียวกัน ไม่ต้องแปลซ้ำ)
const DOW_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
function dayLabel(iso: string, lang: Lang): string {
  return t(lang, `schedule.dow.${DOW_KEYS[new Date(iso + "T00:00:00").getDay()]}`);
}
function shortDate(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

export default function StockInPage() {
  const me = useMe();
  const lang = useLang();
  const scoped = !!me && me.branchScope !== "all";
  const [branch, setBranch] = React.useState<Branch>("NVP");
  const [date, setDate] = React.useState<string>(todayISO());

  React.useEffect(() => {
    if (scoped) setBranch(me!.branchScope as Branch);
  }, [scoped, me]);

  const [recentDays, setRecentDays] = React.useState<RecentDay[]>([]);
  const [rows, setRows] = React.useState<StockInRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch(`/api/stock-in/recent?branch=${branch}&days=14`)
      .then((r) => r.json())
      .then((data: { days?: RecentDay[] }) => { if (alive) setRecentDays(data.days ?? []); })
      .catch(() => { /* quick-list เป็นแค่ shortcut ไม่ block การใช้งานหลัก */ });
    return () => { alive = false; };
  }, [branch]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/stock-in?branch=${branch}&date=${date}`)
      .then((r) => r.json())
      .then((data: { rows?: StockInRow[]; error?: string }) => {
        if (!alive) return;
        if (data.error) { setError(data.error); setRows([]); return; }
        setRows(data.rows ?? []);
      })
      .catch((e) => { if (alive) setError(String(e?.message ?? e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [branch, date]);

  const groups = React.useMemo(() => {
    const out: { category: string; items: StockInRow[] }[] = [];
    for (const r of rows) {
      let g = out.find((x) => x.category === r.category);
      if (!g) { g = { category: r.category, items: [] }; out.push(g); }
      g.items.push(r);
    }
    return out;
  }, [rows]);

  return (
    <div>
      <PageTitle title={t(lang, "stockIn.pageTitle")} />

      <div className="mb-3">
        <BranchPicker value={branch} onChange={setBranch} locked={scoped} />
      </div>

      {/* quick-list 14 วันล่าสุด — กดเลือกวันไหนก็ได้ ไม่ต้องเดาจาก date picker */}
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {recentDays.map((d) => {
          const active = d.date === date;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => setDate(d.date)}
              className={`flex flex-shrink-0 flex-col items-center gap-0.5 rounded-xl px-2.5 py-1.5 text-center transition ${
                active
                  ? "bg-brand-ink text-white"
                  : d.count > 0
                    ? "bg-ok/15 text-ok"
                    : "border border-black/5 bg-white/60 text-brand-ink/35"
              }`}
            >
              <span className="text-[9px] font-medium leading-none">{dayLabel(d.date, lang)}</span>
              <span className="text-xs font-semibold leading-none">{shortDate(d.date)}</span>
              <span className="text-[9px] leading-none">{d.count > 0 ? t(lang, "stockIn.itemCountSuffix", { n: d.count }) : "—"}</span>
            </button>
          );
        })}
      </div>

      <label className="mb-3 flex flex-col gap-1">
        <span className="text-[11px] text-brand-ink/50">{t(lang, "stockIn.pickDateOwnLabel")}</span>
        <input
          type="date" value={date}
          onChange={(e) => setDate(e.target.value || todayISO())}
          className="field"
        />
      </label>

      <GlassCard>
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">{t(lang, "stockIn.sectionHeader", { date: thaiDate(date), branch })}</h2>
          <span className="shrink-0 text-xs text-brand-ink/50">{t(lang, "stockIn.itemCountSuffix", { n: rows.length })}</span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-sm text-brand-ink/50">{t(lang, "stockIn.loading")}</div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-warn">{error}</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-brand-ink/50">{t(lang, "stockIn.emptyToday")}</div>
        ) : (
          groups.map((g, gi) => (
            <Accordion key={g.category} title={g.category} count={t(lang, "stockIn.itemCountSuffix", { n: g.items.length })} defaultOpen={gi === 0}>
              <div className="grid gap-1.5 py-1">
                {g.items.map((r) => (
                  <div key={r.itemId} className="flex items-center justify-between gap-2 rounded-lg bg-black/[.02] px-2.5 py-2">
                    <span className="text-[13px] font-medium">{r.name}</span>
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-ok">
                      {r.inPack > 0 && t(lang, "stockIn.inPackAmount", { n: r.inPack })}
                      {r.inPack > 0 && r.inG > 0 ? " " : ""}
                      {r.inG > 0 && t(lang, "stockIn.inGAmount", { n: r.inG })}
                    </span>
                  </div>
                ))}
              </div>
            </Accordion>
          ))
        )}
      </GlassCard>
    </div>
  );
}
