"use client";
// v1.12 · ตรวจวันหมดอายุ — รอบตรวจ อังคาร + ศุกร์ (รถเข้า พุธ + เสาร์ → ตรวจก่อน 1 วัน ของส่งคืนขึ้นรถทัน)
//
// แนวคิดที่ตกลงกับแพร: ไม่กรอกวันหมดอายุตอนรับของ เพราะคุมลูกค้าไม่ได้ (ลูกค้าหยิบของหมดอายุช้าสุดก่อน)
// ยังไงก็ต้องเดินดูของจริงบนชั้น → นับของจริงทุกรอบตรวจแทน ไม่เชื่อตัวเลขเก่า
//
// ปลายทางมี 2 ทาง: แกะขายหน้าร้าน (ลง ขาย/ใช้) · ส่งคืนครัวกลาง (ลง ส่งคืน/เสีย) — ของทิ้งก็ส่งคืน ไม่ทิ้งเอง
import React from "react";
import type { Branch, Item, Meta, ExpiryCheckRow, ExpiryDisposition } from "@/lib/types";
import { useMe, useLang, EXPIRY_SAVED_EVENT } from "@/components/nav";
import { TodayNextStep } from "@/components/today-next-step";
import { GlassCard, BranchPicker, PageTitle, Badge, Button, SaveBar, Stat } from "@/components/ui";
import { todayISO, thaiDate } from "@/lib/fmt";
import { weekdayFromDate, isExpiryCheckDue, expiryStatus, daysUntil, effectiveWarnDays } from "@/lib/calc";
import { t } from "@/lib/i18n";

// แถวบนหน้าจอ = 1 ชุดวันหมดอายุ · ให้ key ท้องถิ่นไว้ track ตอนแก้/ลบ (ยังไม่มี id จาก DB ตอนเพิ่งเพิ่ม)
interface Draft extends ExpiryCheckRow {
  key: string;
}
let seq = 0;
const newDraft = (itemId: string): Draft => ({
  key: `d${++seq}`, itemId, expiryDate: "", qty: 0, disposition: null, note: "",
});

// โน้ตต่อหมวด — อธิบายเฉพาะหมวดที่กติกาต่างจากปกติ ไม่ใส่ทุกหมวดให้รก
// (ค่าเป็น i18n key ไม่ใช่ข้อความตรง ๆ — แปลตอนใช้งานผ่าน t(lang, ...) เพราะ module scope ไม่มี lang)
const CATEGORY_NOTE: Record<string, string> = {
  "Yogurt 500g/Box": "expiry.categoryNoteYogurt500g",
};

// labelKey แทนข้อความตรง ๆ ด้วยเหตุผลเดียวกับ CATEGORY_NOTE ข้างบน
const STATUS_STYLE = {
  expired: { labelKey: "expiry.statusExpired", tone: "warn" as const, bar: "border-l-brand-red" },
  near: { labelKey: "expiry.statusNear", tone: "orange" as const, bar: "border-l-brand-orange" },
  ok: { labelKey: "expiry.statusOk", tone: "ok" as const, bar: "border-l-ok" },
};

export default function ExpiryPage() {
  const me = useMe();
  const lang = useLang();
  const scoped = !!me && me.branchScope !== "all";
  const [branch, setBranch] = React.useState<Branch>("NVP");
  const [date, setDate] = React.useState<string>(todayISO());
  React.useEffect(() => {
    if (scoped) setBranch(me!.branchScope as Branch);
  }, [scoped, me]);

  const [meta, setMeta] = React.useState<Meta | null>(null);
  React.useEffect(() => {
    fetch("/api/meta").then((r) => r.json()).then((m: Meta) => setMeta(m)).catch(() => {});
  }, []);

  const [drafts, setDrafts] = React.useState<Draft[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [savedOnce, setSavedOnce] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    setLoading(true);
    setErr(null);
    fetch(`/api/expiry-checks?branch=${branch}&date=${date}`)
      .then((r) => r.json())
      .then((d: { rows?: ExpiryCheckRow[]; error?: string }) => {
        if (d.error) { setErr(d.error); setDrafts([]); return; }
        setDrafts((d.rows ?? []).map((r) => ({ ...r, key: `s${r.id}` })));
      })
      .catch((e) => setErr(String(e?.message ?? e)))
      .finally(() => setLoading(false));
  }, [branch, date]);
  React.useEffect(() => { load(); }, [load]);

  // 12 รายการที่ตั้งค่าให้ตรวจ + stock ในสาขานี้
  const items = React.useMemo(() => {
    if (!meta) return [] as Item[];
    return meta.items
      .filter((it) => it.expiryCheck && meta.par[it.id]?.[branch] != null)
      .sort((a, b) => a.sort - b.sort);
  }, [meta, branch]);

  const groups = React.useMemo(() => {
    const out: { category: string; items: Item[] }[] = [];
    for (const it of items) {
      let g = out.find((x) => x.category === it.category);
      if (!g) { g = { category: it.category, items: [] }; out.push(g); }
      g.items.push(it);
    }
    return out;
  }, [items]);

  const weekday = React.useMemo(() => weekdayFromDate(date), [date]);
  const isDue = isExpiryCheckDue(weekday);

  const rowsOf = (itemId: string) => drafts.filter((d) => d.itemId === itemId);
  const patch = (key: string, p: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...p } : d)));
  const removeRow = (key: string) => setDrafts((prev) => prev.filter((d) => d.key !== key));

  const statusOf = (d: Draft, it: Item) =>
    d.expiryDate ? expiryStatus(d.expiryDate, date, it.expiryWarnDays ?? 5) : null;

  const nameById = React.useMemo(
    () => new Map((meta?.items ?? []).map((i) => [i.id, i.name])),
    [meta]
  );

  // ปลายทางที่อนุญาตต่อรายการ — โชว์เฉพาะปุ่มที่ทำได้จริง พนักงานจึงเลือกผิดไม่ได้ตั้งแต่แรก
  // (แพรกำหนด 2026-07-27: Yogurt 500g แกะรวมอย่างเดียว · ถุง/Cereals ส่งคืนอย่างเดียว)
  const optionsFor = React.useCallback((it: Item): { v: ExpiryDisposition; label: string }[] => {
    const out: { v: ExpiryDisposition; label: string }[] = [];
    const convertTo = it.expiryConvertToItemId ?? null;
    const convertReady = !!convertTo && Number(it.expiryConvertG ?? 0) > 0;
    if (it.expiryAllowSellFront !== false) {
      if (convertReady) {
        out.push({
          v: "convert",
          label: t(lang, "expiry.optionConvertWith", {
            name: nameById.get(convertTo!) ?? t(lang, "expiry.optionOtherItemFallback"),
          }),
        });
      } else if (!convertTo) out.push({ v: "sell_front", label: t(lang, "expiry.optionSellFront") });
    }
    if (it.expiryAllowReturn !== false) out.push({ v: "return", label: t(lang, "expiry.optionReturn") });
    return out;
  }, [nameById, lang]);

  const filled = React.useMemo(
    () => drafts.filter((d) => d.expiryDate && d.qty > 0),
    [drafts]
  );
  const countReturn = filled.filter((d) => d.disposition === "return").length;
  const countSell = filled.filter((d) => d.disposition === "sell_front" || d.disposition === "convert").length;
  const itemsChecked = new Set(filled.map((d) => d.itemId)).size;

  // ชุดที่ถึงเกณฑ์เตือนแล้วแต่ยังไม่เลือกปลายทาง — กันบันทึกทิ้งไว้ครึ่ง ๆ กลาง ๆ
  const pendingDecision = React.useMemo(() => {
    const itemById = new Map(items.map((it) => [it.id, it]));
    return filled.filter((d) => {
      const it = itemById.get(d.itemId);
      if (!it) return false;
      const st = statusOf(d, it);
      return (st === "near" || st === "expired") && !d.disposition;
    });
  }, [filled, items, date]);

  // หน้าต่างสรุปหลังบันทึก (เฉพาะรอบที่มีของส่งคืน)
  const [done, setDone] = React.useState<{ ret: number; sell: number } | null>(null);

  async function save() {
    if (pendingDecision.length > 0) {
      const ok = window.confirm(t(lang, "expiry.confirmPendingDecision", { n: pendingDecision.length }));
      if (!ok) return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/expiry-checks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch, date,
          rows: filled.map(({ key, ...r }) => r),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? t(lang, "expiry.errSaveFailed"));
      window.dispatchEvent(new Event(EXPIRY_SAVED_EVENT)); // ให้ badge ที่เมนูหายทันที
      setSavedOnce(true);
      // มีของส่งคืน → เด้งหน้าต่างบอกขั้นตอนต่อ · ไม่มีของส่งคืนก็ไม่ต้องให้กดปิดหน้าต่างเปล่า ๆ
      if (countReturn > 0) setDone({ ret: countReturn, sell: countSell });
      else window.alert(t(lang, "expiry.alertSavedNoReturn", { n: countSell }));
      load();
    } catch (e: any) {
      setErr(e?.message ?? t(lang, "expiry.errSaveFailed"));
      window.alert(e?.message ?? t(lang, "expiry.errSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-28">
      <PageTitle title={t(lang, "expiry.title")} right={<Badge tone="blue">{thaiDate(date)}</Badge>} />

      <GlassCard className="mb-3">
        <div className="grid gap-3">
          <BranchPicker value={branch} onChange={setBranch} locked={scoped} />
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">{t(lang, "expiry.dateLabel")}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
          </label>
          {!isDue && (
            <p className="rounded-lg bg-black/[.03] px-2.5 py-2 text-[11.5px] leading-relaxed text-brand-ink/55">
              {t(lang, "expiry.notDueHint")}
            </p>
          )}
        </div>
      </GlassCard>

      {/* กล่องเดียวจบ (แพรขอ 2026-07-28) — เดิมมี 3 กล่องซ้อนกัน: เตือนรอบตรวจ + วิธีทำ + คำอธิบาย
          พนักงานต้องอ่าน 3 ที่กว่าจะรู้ว่าต้องทำอะไร */}
      <div className={`mb-3 rounded-xl border px-3.5 py-3 ${isDue ? "border-warn/35 bg-warn/[.07]" : "border-black/10 bg-black/[.02]"}`}>
        {isDue && <p className="mb-1.5 text-[19px] font-bold leading-tight text-warn">{t(lang, "expiry.dueTitle")}</p>}
        <p className="text-[12.5px] leading-relaxed text-brand-ink/75">
          <b className="font-semibold">{t(lang, "expiry.instructionsLabel")}</b>{t(lang, "expiry.instructionsBody")}
        </p>
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-ok/40 bg-ok/[.12] px-2.5 py-2">
          <span className="mt-[1px] grid h-4 w-4 shrink-0 place-items-center rounded-full bg-ok text-[10px] font-bold text-white">✓</span>
          <p className="text-[12px] font-medium leading-relaxed text-ok">
            {t(lang, "expiry.autoDeductNote")}
            <span className="block font-semibold">{t(lang, "expiry.noRepeatEntryNote")}</span>
          </p>
        </div>
      </div>

      {err && (
        <div className="mb-3 rounded-xl border border-brand-red/30 bg-brand-red/10 px-3.5 py-2.5 text-sm text-brand-red">
          {err}
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-brand-ink/50">{t(lang, "common.loading")}</p>
      ) : items.length === 0 ? (
        <GlassCard>
          <p className="py-8 text-center text-sm text-brand-ink/50">
            {t(lang, "expiry.emptyNoItems")}
          </p>
        </GlassCard>
      ) : (
        <div className="grid gap-3">
          {groups.map((g) => (
            <GlassCard key={g.category}>
              <p className="mb-1 text-[11px] uppercase tracking-wide text-brand-ink/45">{g.category}</p>
              {CATEGORY_NOTE[g.category] && (
                <p className="mb-2 rounded-lg bg-black/[.03] px-2.5 py-1.5 text-[11px] leading-relaxed text-brand-ink/55">
                  {t(lang, CATEGORY_NOTE[g.category])}
                </p>
              )}
              <div className="grid gap-2">
                {g.items.map((it) => {
                  const rows = rowsOf(it.id);
                  const opts = optionsFor(it);
                  return (
                    <div key={it.id} className="rounded-lg bg-black/[.02] px-2.5 py-2">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{it.name}</span>
                        <span className="shrink-0 text-[10.5px] text-brand-ink/40">
                          {t(lang, "expiry.warnDaysLabel", { n: effectiveWarnDays(it.expiryWarnDays ?? 5, weekday) })}
                        </span>
                      </div>

                      {rows.length === 0 && (
                        <p className="mb-1.5 text-[11px] text-brand-ink/40">{t(lang, "expiry.notFilledYet")}</p>
                      )}

                      {rows.map((d) => {
                        const st = statusOf(d, it);
                        const style = st ? STATUS_STYLE[st] : null;
                        const needDecision = st === "near" || st === "expired";
                        const left = d.expiryDate ? daysUntil(d.expiryDate, date) : null;
                        return (
                          <div
                            key={d.key}
                            className={`mb-1.5 rounded-lg border-l-[3px] bg-white/70 px-2 py-1.5 ${style?.bar ?? "border-l-black/10"}`}
                          >
                            <label className="flex flex-col gap-0.5">
                              <span className="text-[9.5px] text-brand-ink/45">{t(lang, "expiry.expiryDateLabel")}</span>
                              <input
                                type="date" value={d.expiryDate}
                                onChange={(e) => patch(d.key, { expiryDate: e.target.value })}
                                className="field w-full px-2 py-1.5 text-[13px]"
                              />
                            </label>
                            <div className="mt-1 flex items-end gap-2">
                              <label className="flex flex-1 flex-col gap-0.5">
                                <span className="text-[9.5px] text-brand-ink/45">{t(lang, "expiry.qtyLabel", { unit: it.unit })}</span>
                                <input
                                  inputMode="numeric" value={d.qty || ""}
                                  onChange={(e) => patch(d.key, { qty: Number(e.target.value) || 0 })}
                                  className="field w-full px-2 py-1.5 text-center text-[13px]"
                                />
                              </label>
                              <button
                                type="button" onClick={() => removeRow(d.key)}
                                className="shrink-0 pb-2 text-[11px] font-medium text-warn underline underline-offset-2"
                              >
                                {t(lang, "expiry.removeRowButton")}
                              </button>
                            </div>

                            {style && (
                              <div className="mt-1 flex items-center gap-1.5">
                                <Badge tone={style.tone}>{t(lang, style.labelKey)}</Badge>
                                {left !== null && (
                                  <span className="text-[10.5px] text-brand-ink/45">
                                    {left < 0
                                      ? t(lang, "expiry.daysOverdue", { n: -left })
                                      : left === 0
                                      ? t(lang, "expiry.expiresToday")
                                      : t(lang, "expiry.daysRemaining", { n: left })}
                                  </span>
                                )}
                              </div>
                            )}

                            {needDecision && opts.length === 0 && (
                              <p className="mt-1.5 rounded-lg bg-warn/10 px-2 py-1.5 text-[10.5px] leading-relaxed text-warn">
                                {t(lang, "expiry.noDispositionSetWarning")}
                              </p>
                            )}

                            {needDecision && opts.length > 0 && (
                              <div className="mt-1.5">
                                <p className="mb-1 text-[10.5px] text-brand-ink/50">{t(lang, "expiry.chooseDispositionLabel")}</p>
                                <div className="flex gap-1.5">
                                  {opts.map((opt) => (
                                    <button
                                      key={opt.v}
                                      type="button"
                                      onClick={() => patch(d.key, { disposition: d.disposition === opt.v ? null : opt.v })}
                                      className={`flex-1 rounded-lg px-2 py-1.5 text-[11.5px] font-medium transition ${
                                        d.disposition === opt.v
                                          ? "bg-brand-red text-white"
                                          : "border border-black/10 bg-white/70 text-brand-ink"
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() => setDrafts((prev) => [...prev, newDraft(it.id)])}
                        className="text-[11.5px] font-medium text-brand-red"
                      >
                        {rows.length > 0 ? t(lang, "expiry.addRowButtonMore") : t(lang, "expiry.addRowButton")}
                      </button>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {done && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 px-4 py-8">
          <div className="w-full max-w-sm rounded-2xl bg-brand-cream p-4 shadow-2xl">
            <p className="text-center text-[17px] font-bold text-ok">{t(lang, "expiry.doneTitle")}</p>
            <p className="mb-3 text-center text-[12px] text-brand-ink/55">
              {t(lang, "expiry.doneSummaryReturn", { n: done.ret })}
              {done.sell > 0 ? t(lang, "expiry.doneSummarySellSuffix", { n: done.sell }) : ""}
            </p>

            {[
              { n: 1, t: t(lang, "expiry.step1Title"), s: t(lang, "expiry.step1Sub") },
              { n: 2, t: t(lang, "expiry.step2Title"), s: t(lang, "expiry.step2Sub") },
              { n: 3, t: t(lang, "expiry.step3Title"), s: t(lang, "expiry.step3Sub") },
            ].map((st) => (
              <div key={st.n} className="flex items-start gap-2.5 border-t border-black/[.07] py-2.5">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-ink text-[11px] font-bold text-white">
                  {st.n}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold leading-snug">{st.t}</p>
                  <p className="text-[11px] leading-relaxed text-brand-ink/50">{st.s}</p>
                </div>
              </div>
            ))}

            <div className="mt-3 flex items-start gap-2 rounded-xl border border-ok/40 bg-ok/[.12] px-3 py-2.5">
              <span className="mt-[1px] grid h-4 w-4 shrink-0 place-items-center rounded-full bg-ok text-[10px] font-bold text-white">✓</span>
              <p className="text-[12px] font-medium leading-relaxed text-ok">
                {t(lang, "expiry.doneAutoDeductNote")}
                <span className="block font-semibold">{t(lang, "expiry.noRepeatEntryNote")}</span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => setDone(null)}
              className="mt-3 w-full rounded-xl bg-brand-ink px-4 py-3 text-[13px] font-semibold text-white"
            >
              {t(lang, "expiry.acknowledgeButton")}
            </button>
          </div>
        </div>
      )}

      <TodayNextStep show={savedOnce} hideTask="expiry" />

      {!loading && items.length > 0 && (
        <SaveBar>
          <div className="mb-2 grid grid-cols-3 gap-2">
            <Stat label={t(lang, "expiry.statReturn")} value={`${countReturn}`} tone={countReturn > 0 ? "warn" : "default"} />
            <Stat label={t(lang, "expiry.statSellFront")} value={`${countSell}`} tone={countSell > 0 ? "ok" : "default"} />
            <Stat label={t(lang, "expiry.statChecked")} value={`${itemsChecked}/${items.length}`} />
          </div>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? t(lang, "common.saving") : t(lang, "expiry.saveButton")}
          </Button>
          <p className="mt-1.5 text-center text-[10.5px] leading-relaxed text-brand-ink/45">
            {t(lang, "expiry.footerNote")}
          </p>
        </SaveBar>
      )}
    </div>
  );
}
