"use client";
// v1.13 · สิทธิ์ซื้อของในร้าน — วงเงินส่วนลด 400 บาท/คน/เดือน (แพรกำหนดสเปก 2026-07-27)
//
// กติกา: คิดที่ราคาขายหน้าร้านเต็ม · ไม่ทบ รีเซ็ตทุกวันที่ 1 · แบ่งใช้หลายบิลได้
// (เหลือ 50 ซื้อ 200 → ลด 50 จ่ายเอง 150 → สิทธิ์เหลือ 0)
// ใช้ครบแล้วซื้อได้ในราคาลด 30% แต่ "ไม่ต้องบันทึก" เพราะไม่ได้ตัดสิทธิ์
// → ปิดฟอร์มทันทีที่เหลือ 0 กันพนักงานเผลอถ่ายบิลลด 30% เข้ามาแล้วตัดสิทธิ์ผิด
import React from "react";
import { useMe, useLang } from "@/components/nav";
import { t, type Lang } from "@/lib/i18n";
import { GlassCard, PageTitle, Badge, Button, Stat } from "@/components/ui";
import { todayISO, thaiDate, baht } from "@/lib/fmt";
import { monthKeyOf } from "@/lib/calc";
import type { StaffAllowanceUse, AllowanceSummary } from "@/lib/types";

interface MineResp {
  month: string;
  enabled: boolean;
  monthly: number;
  used: number;
  remaining: number;
  uses: StaffAllowanceUse[];
}
interface OverviewResp {
  summaries: AllowanceSummary[];
  needsReview: (StaffAllowanceUse & { imageUrl?: string })[];
}

// ใช้คีย์เดือนร่วมกับ schedule.months.* (ชื่อย่อเดือนชุดเดียวกัน ไม่ต้องแปลซ้ำ)
const MONTH_KEYS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"] as const;
const monthLabel = (m: string, lang: Lang) => {
  const [y, mo] = m.split("-").map(Number);
  const year = lang === "th" ? y + 543 : y; // ปีพุทธศักราชเฉพาะภาษาไทย
  return `${t(lang, `schedule.months.${MONTH_KEYS[mo - 1]}`)} ${year}`;
};
const nextMonthLabel = (m: string, lang: Lang) => {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `1 ${t(lang, `schedule.months.${MONTH_KEYS[0]}`)}` : `1 ${t(lang, `schedule.months.${MONTH_KEYS[mo]}`)}`;
};

export default function AllowancePage() {
  const me = useMe();
  const lang = useLang();
  const isAdmin = me?.role === "admin";
  const month = monthKeyOf(todayISO());

  const [mine, setMine] = React.useState<MineResp | null>(null);
  const [ov, setOv] = React.useState<OverviewResp | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const loadMine = React.useCallback(() => {
    fetch(`/api/allowance?month=${month}`)
      .then((r) => r.json())
      .then((d: MineResp & { error?: string }) => (d.error ? setErr(d.error) : setMine(d)))
      .catch((e) => setErr(String(e?.message ?? e)));
  }, [month]);

  React.useEffect(() => { loadMine(); }, [loadMine]);
  React.useEffect(() => {
    if (!isAdmin) return;
    fetch(`/api/allowance/overview?month=${month}`)
      .then((r) => r.json())
      .then((d: OverviewResp & { error?: string }) => { if (!d.error) setOv(d); })
      .catch(() => {});
  }, [isAdmin, month]);

  // ── ฟอร์มบันทึกบิล ──
  const [useDate, setUseDate] = React.useState(todayISO());
  const [billTotal, setBillTotal] = React.useState("");
  const [discount, setDiscount] = React.useState("");
  const [image, setImage] = React.useState<{ base64: string; mediaType: string; preview: string } | null>(null);
  // OCR อ่านบิลให้ (เฟส 2) — ผลที่ได้แค่ "เติมให้" พนักงานยังต้องตรวจก่อนกดบันทึกเสมอ
  const [ocrState, setOcrState] = React.useState<"idle" | "reading" | "done" | "failed">("idle");
  const [ocrMsg, setOcrMsg] = React.useState("");
  const [ocrDiscount, setOcrDiscount] = React.useState<number | null>(null);

  const toNum = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  // จ่ายเอง = ยอดเต็ม − ส่วนลด · คำนวณให้ ไม่ให้กรอกเอง จะได้ไม่มีทางกรอกขัดกันเอง
  const paid = Math.max(toNum(billTotal) - toNum(discount), 0);
  const remaining = mine?.remaining ?? 0;
  const overQuota = toNum(discount) > remaining;
  const canSave = toNum(discount) > 0 && toNum(billTotal) >= toNum(discount) && !saving;

  function pickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      const base64 = url.split(",")[1] ?? "";
      setImage({ base64, mediaType: f.type, preview: url });
      readBill(base64, f.type);
    };
    reader.readAsDataURL(f);
  }

  // เติมช่องให้จากรูป — เติมเฉพาะช่องที่ยังว่าง ไม่ทับที่พนักงานพิมพ์ไปแล้ว
  async function readBill(base64: string, mediaType: string) {
    setOcrState("reading");
    setOcrMsg("");
    setOcrDiscount(null);
    try {
      const res = await fetch("/api/allowance/read-bill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const d = await res.json();
      if (d?.error || !d?.reading) throw new Error(d?.error ?? t(lang, "allowance.errors.readBillFailed"));
      const r = d.reading as { billTotal: number | null; discountAmount: number | null; billDate: string | null; clarity: string };
      if (r.billTotal != null) setBillTotal((v) => (v ? v : String(r.billTotal)));
      if (r.discountAmount != null) setDiscount((v) => (v ? v : String(r.discountAmount)));
      if (r.billDate) setUseDate((v) => (v === todayISO() ? r.billDate! : v));
      setOcrDiscount(r.discountAmount);
      if (r.clarity === "unclear") {
        setOcrState("failed");
        setOcrMsg(t(lang, "allowance.ocr.unclear"));
      } else if (r.discountAmount == null) {
        setOcrState("failed");
        setOcrMsg(t(lang, "allowance.ocr.noDiscountFound"));
      } else {
        setOcrState("done");
        setOcrMsg(t(lang, "allowance.ocr.done"));
      }
    } catch (e: any) {
      setOcrState("failed");
      setOcrMsg(String(e?.message ?? e) + t(lang, "allowance.ocr.fallbackSuffix"));
    }
  }

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/allowance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          useDate, billTotal: toNum(billTotal), discountAmount: toNum(discount), paidAmount: paid,
          ocrDiscount, imageBase64: image?.base64, mediaType: image?.mediaType,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d?.ok) throw new Error(d?.error ?? t(lang, "allowance.save.genericError"));
      window.alert(d.needsReview ? t(lang, "allowance.save.needsReviewAlert", { note: d.reviewNote }) : t(lang, "allowance.save.successAlert"));
      setBillTotal(""); setDiscount(""); setImage(null);
      setOcrState("idle"); setOcrMsg(""); setOcrDiscount(null);
      loadMine();
    } catch (e: any) {
      setErr(e?.message ?? t(lang, "allowance.save.genericError"));
      window.alert(e?.message ?? t(lang, "allowance.save.genericError"));
    } finally {
      setSaving(false);
    }
  }

  if (!mine) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-4">
        <PageTitle title={t(lang, "allowance.pageTitle")} />
        {err ? (
          <GlassCard><p className="py-6 text-center text-sm text-brand-red">{err}</p></GlassCard>
        ) : (
          <p className="py-8 text-center text-sm text-brand-ink/50">{t(lang, "common.loading")}</p>
        )}
      </div>
    );
  }

  const pct = mine.monthly > 0 ? Math.min((mine.used / mine.monthly) * 100, 100) : 0;
  const exhausted = mine.remaining <= 0;

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-16">
      <PageTitle title={t(lang, "allowance.pageTitle")} right={<Badge tone="blue">{monthLabel(mine.month, lang)}</Badge>} />

      {!mine.enabled ? (
        <GlassCard>
          <p className="py-6 text-center text-sm text-brand-ink/50">{t(lang, "allowance.notEnabled")}</p>
        </GlassCard>
      ) : (
        <>
          <GlassCard className="mb-3">
            <p className="text-[11px] text-brand-ink/50">{t(lang, "allowance.summary.remainingLabel")}</p>
            <p className="text-[32px] font-semibold leading-tight tabular-nums">{baht(mine.remaining)}</p>
            <div className="my-2 h-2 overflow-hidden rounded-full bg-black/[.06]">
              <div className={`h-full ${exhausted ? "bg-warn" : "bg-brand-red"}`} style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[11.5px] text-brand-ink/55">
              {t(lang, "allowance.summary.usedOfMonthly", { used: baht(mine.used), monthly: baht(mine.monthly), nextMonth: nextMonthLabel(mine.month, lang) })}
            </p>
          </GlassCard>

          {exhausted ? (
            <div className="mb-3 rounded-xl border border-warn/30 bg-warn/10 px-3.5 py-3 text-[12.5px] leading-relaxed text-warn">
              {t(lang, "allowance.summary.exhaustedNotice")}
              <span className="font-medium">{t(lang, "allowance.summary.exhaustedNoRecord")}</span>
              {t(lang, "allowance.summary.exhaustedReason")}
            </div>
          ) : (
            <GlassCard className="mb-3">
              <p className="mb-2 text-[13px] font-medium">{t(lang, "allowance.form.heading")}</p>
              <div className="grid gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-brand-ink/50">{t(lang, "allowance.form.dateLabel")}</span>
                  <input type="date" value={useDate} onChange={(e) => setUseDate(e.target.value)} className="field" />
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-brand-ink/50">{t(lang, "allowance.form.billTotalLabel")}</span>
                    <input inputMode="decimal" value={billTotal} onChange={(e) => setBillTotal(e.target.value)} className="field" placeholder="0" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-brand-ink/50">{t(lang, "allowance.form.discountLabel")}</span>
                    <input inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} className="field" placeholder="0" />
                  </label>
                </div>

                <div className="rounded-lg bg-black/[.03] px-3 py-2 text-[12.5px]">
                  <div className="flex justify-between">
                    <span className="text-brand-ink/60">{t(lang, "allowance.form.paidSelfLabel")}</span>
                    <span className="font-medium tabular-nums">{baht(paid)}</span>
                  </div>
                  <div className="mt-0.5 flex justify-between">
                    <span className="text-brand-ink/60">{t(lang, "allowance.form.remainingAfterLabel")}</span>
                    <span className={`font-medium tabular-nums ${overQuota ? "text-warn" : ""}`}>
                      {baht(Math.max(remaining - toNum(discount), 0))}
                    </span>
                  </div>
                </div>

                {overQuota && (
                  <p className="rounded-lg bg-warn/10 px-2.5 py-2 text-[11.5px] leading-relaxed text-warn">
                    {t(lang, "allowance.form.overQuotaWarning", { remaining: baht(remaining) })}
                  </p>
                )}

                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-brand-ink/50">{t(lang, "allowance.form.imageLabel")}</span>
                  <input type="file" accept="image/*" capture="environment" onChange={pickImage} className="text-[12px]" />
                </label>
                {ocrState !== "idle" && (
                  <p className={`rounded-lg px-2.5 py-2 text-[11.5px] leading-relaxed ${
                    ocrState === "reading" ? "bg-black/[.03] text-brand-ink/55"
                      : ocrState === "done" ? "bg-ok/10 text-ok"
                      : "bg-warn/10 text-warn"
                  }`}>
                    {ocrState === "reading" ? t(lang, "allowance.ocr.reading") : ocrMsg}
                  </p>
                )}
                {image && <img src={image.preview} alt={t(lang, "allowance.billImageAlt")} className="max-h-52 w-full rounded-lg object-contain" />}

                <Button onClick={save} disabled={!canSave}>
                  {saving ? t(lang, "common.saving") : t(lang, "allowance.form.saveButton")}
                </Button>
                {toNum(billTotal) > 0 && toNum(billTotal) < toNum(discount) && (
                  <p className="text-center text-[11px] text-warn">{t(lang, "allowance.form.billTotalTooLow")}</p>
                )}
              </div>
            </GlassCard>
          )}

          <GlassCard className="mb-3">
            <p className="mb-2 text-[13px] font-medium">{t(lang, "allowance.list.heading")}</p>
            {mine.uses.length === 0 ? (
              <p className="py-4 text-center text-[12.5px] text-brand-ink/45">{t(lang, "allowance.list.empty")}</p>
            ) : (
              <div className="grid">
                {mine.uses.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2 border-b border-black/5 py-2 last:border-0">
                    <div className="min-w-0">
                      <div className="text-[12.5px]">{thaiDate(r.useDate)}{r.note ? ` · ${r.note}` : ""}</div>
                      <div className="text-[10.5px] text-brand-ink/45">
                        {t(lang, "allowance.list.billAndPaid", { bill: baht(r.billTotal), paid: baht(r.paidAmount) })}
                        {r.needsReview ? t(lang, "allowance.list.pendingReview") : ""}
                      </div>
                    </div>
                    <span className="shrink-0 text-[13px] font-medium tabular-nums">{baht(r.discountAmount)}</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </>
      )}

      {isAdmin && ov && (
        <>
          <p className="mb-2 mt-6 text-[11px] uppercase tracking-wide text-brand-ink/45">{t(lang, "allowance.admin.sectionTitle")}</p>
          <GlassCard className="mb-3">
            <div className="mb-2 grid grid-cols-2 gap-2">
              <Stat label={t(lang, "allowance.admin.totalUsed")} value={baht(ov.summaries.reduce((s, x) => s + x.used, 0))} />
              <Stat label={t(lang, "allowance.admin.totalQuota")} value={baht(ov.summaries.reduce((s, x) => s + x.monthly, 0))} />
            </div>
            {ov.summaries.length === 0 ? (
              <p className="py-4 text-center text-[12.5px] text-brand-ink/45">{t(lang, "allowance.admin.noOneEnabled")}</p>
            ) : (
              <div className="grid">
                {ov.summaries.map((u) => (
                  <div key={u.userId} className="flex items-center justify-between gap-2 border-b border-black/5 py-2 last:border-0 text-[12.5px]">
                    <span className="min-w-0 flex-1 truncate">{u.userName}<span className="text-brand-ink/40"> · {u.branchScope}</span></span>
                    <span className="tabular-nums text-brand-ink/55">{t(lang, "allowance.admin.usedShort", { amount: baht(u.used) })}</span>
                    <span className="w-20 text-right font-medium tabular-nums">{t(lang, "allowance.admin.remainingShort", { amount: baht(u.remaining) })}</span>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          {ov.needsReview.length > 0 && (
            <GlassCard>
              <p className="mb-2 text-[13px] font-medium text-warn">{t(lang, "allowance.admin.needsReviewTitle", { count: ov.needsReview.length })}</p>
              <div className="grid gap-2">
                {ov.needsReview.map((r) => (
                  <div key={r.id} className="rounded-lg border border-warn/25 bg-warn/[.06] px-2.5 py-2">
                    <div className="flex justify-between gap-2 text-[12.5px]">
                      <span>{r.userName ?? r.userId} · {thaiDate(r.useDate)}</span>
                      <span className="font-medium tabular-nums">{baht(r.discountAmount)}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-warn">{r.reviewNote}</p>
                    {r.imageUrl && <img src={r.imageUrl} alt={t(lang, "allowance.billImageAlt")} className="mt-1.5 max-h-48 w-full rounded object-contain" />}
                  </div>
                ))}
              </div>
            </GlassCard>
          )}
        </>
      )}
    </div>
  );
}
