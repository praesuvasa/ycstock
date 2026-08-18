"use client";
// M4 · ขอเบิกสินค้า — พนักงานสาขา (user/admin) ส่งคำขอของเกิน Par หรือของนอกลิสต์
// v1.31 (แพรขอ 2026-08-07) — admin/restock กรองดูเป็นวันได้ + ย้ายรายการที่จะเติมจริงไปเมนู "ต้องเติม"
// สถานะ (pending/moved) เห็นเฉพาะ admin/restock — พนักงานทั่วไป (role user) ไม่เห็นเลย ไม่ส่งไปแสดงในส่วน "คำขอของฉัน"
import React from "react";
import type { Branch, Meta, BranchNotice } from "@/lib/types";
import { useMe, useLang } from "@/components/nav";
import { GlassCard, BranchPicker, PageTitle, Button, Badge } from "@/components/ui";
import { todayISO } from "@/lib/fmt";
import { t } from "@/lib/i18n";

interface RequisitionRow {
  id: string; branch: Branch; itemId?: string; itemName: string; qty: number; unit?: string;
  note: string; requestedBy: string; createdAt: string;
  status?: "pending" | "moved"; movedAt?: string; movedBy?: string;
}

type PickMode = "existing" | "custom";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtRow(r: RequisitionRow): string {
  return `${r.itemName}${r.unit ? ` (${r.unit})` : ""} × ${r.qty}`;
}

// ── รอบตัดเวลาขอเบิก (2026-07-21 แพรยืนยัน) — ขอก่อนอังคารเที่ยง → ของเข้าพุธ, ขอก่อนศุกร์เที่ยง → ของเข้าเสาร์
// เลยศุกร์เที่ยงของสัปดาห์นี้แล้ว → เลื่อนไปรอบอังคารเที่ยง/พุธ ของสัปดาห์ถัดไป
// วันที่ในป้ายนี้ใช้ปี พ.ศ. ตามที่แพรขอ (ต่างจาก thaiDate() ใน lib/fmt.ts ที่ตั้งใจไม่แปลง พ.ศ. ไว้เพื่อความชัดในหน้าอื่น)
const DAY_TH = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
function beDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear() + 543;
  return `${dd}/${mm}/${yyyy}`;
}
// yyyy-mm-dd จาก local components — ห้ามใช้ toISOString() ตรงๆ ที่นี่ เพราะแปลงเป็น UTC ก่อน
// อาจได้วันที่เพี้ยนไป 1 วันถ้าเปิดหน้านี้ช่วงเช้ามืด (ก่อน 07:00 เวลาไทย = ยังเป็นเมื่อวานใน UTC)
function isoDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function atNoon(d: Date): Date { const x = new Date(d); x.setHours(12, 0, 0, 0); return x; }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

interface RequestRound { cutoffDay: string; cutoffDate: Date; deliveryDay: string; deliveryDate: Date }
function computeRound(now: Date): RequestRound {
  const day = now.getDay(); // 0=อาทิตย์..6=เสาร์
  const monday = addDays(now, -(day === 0 ? 6 : day - 1));
  const tueCutoff = atNoon(addDays(monday, 1));
  const friCutoff = atNoon(addDays(monday, 4));
  const wedDelivery = addDays(monday, 2);
  const satDelivery = addDays(monday, 5);

  if (now < tueCutoff) return { cutoffDay: "อังคาร", cutoffDate: tueCutoff, deliveryDay: "พุธ", deliveryDate: wedDelivery };
  if (now < friCutoff) return { cutoffDay: "ศุกร์", cutoffDate: friCutoff, deliveryDay: "เสาร์", deliveryDate: satDelivery };
  return { cutoffDay: "อังคาร", cutoffDate: atNoon(addDays(monday, 8)), deliveryDay: "พุธ", deliveryDate: addDays(monday, 9) };
}

export default function RequisitionsPage() {
  const me = useMe();
  const lang = useLang();
  const isRestock = me?.role === "restock";
  const isAdmin = me?.role === "admin";
  const canSubmit = me?.role === "user" || isAdmin;
  const scoped = !!me && me.branchScope !== "all";

  // ล็อกเวลา "ตอนนี้" ไว้ค่าเดียวตอน mount (useMemo ว่าง deps) — กันเรียก new Date() ซ้ำหลายจุดแล้วค่าขยับเพี้ยนกันเอง
  const now = React.useMemo(() => new Date(), []);
  const round = React.useMemo(() => computeRound(now), [now]);

  const [branch, setBranch] = React.useState<Branch>("NVP");
  React.useEffect(() => {
    if (scoped) setBranch(me!.branchScope as Branch);
  }, [scoped, me]);

  const [meta, setMeta] = React.useState<Meta | null>(null);
  React.useEffect(() => {
    fetch("/api/meta").then((r) => r.json()).then((m: Meta) => setMeta(m)).catch(() => {});
  }, []);

  // ประกาศพิเศษของสาขาที่เลือก (รวมประกาศ "ทุกสาขา") — เช่น รอบส่งของเลื่อนเพราะวันหยุด
  const [notices, setNotices] = React.useState<BranchNotice[]>([]);
  React.useEffect(() => {
    if (!canSubmit) return;
    fetch(`/api/notices?branch=${branch}`)
      .then((r) => r.json())
      .then((d: { rows?: BranchNotice[] }) => setNotices(d.rows ?? []))
      .catch(() => {});
  }, [canSubmit, branch]);

  const [pickMode, setPickMode] = React.useState<PickMode>("existing");
  const [itemId, setItemId] = React.useState("");
  const [customName, setCustomName] = React.useState("");
  const [customUnit, setCustomUnit] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [note, setNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submitMsg, setSubmitMsg] = React.useState<string | null>(null);

  const [myRows, setMyRows] = React.useState<RequisitionRow[]>([]);
  const [allRows, setAllRows] = React.useState<RequisitionRow[]>([]);
  const [loadingAll, setLoadingAll] = React.useState(true);
  // ว่าง = ดูทั้งหมด (ไม่กรองวัน) · ค่าเริ่มต้นวันนี้ กันคำขอทุกวันไหลรวมกันหน้าเดียว (แพรขอ 2026-08-07)
  const [filterDate, setFilterDate] = React.useState(todayISO());
  const [movingId, setMovingId] = React.useState<string | null>(null);
  // เลือกได้ว่าจะย้ายไปต้องเติมของวันไหน ต่อรายการ (แพรขอ 2026-08-11) — ไม่เลือก = ใช้รอบส่งของถัดไปเหมือนเดิม
  const [moveDate, setMoveDate] = React.useState<Record<string, string>>({});

  const loadMine = React.useCallback(() => {
    if (!canSubmit) return;
    fetch("/api/requisitions?mine=1")
      .then((r) => r.json())
      .then((d: { rows?: RequisitionRow[] }) => setMyRows(d.rows ?? []))
      .catch(() => {});
  }, [canSubmit]);

  const loadAll = React.useCallback(() => {
    if (!(isRestock || isAdmin)) return;
    setLoadingAll(true);
    const qs = filterDate ? `?date=${filterDate}` : "";
    fetch(`/api/requisitions${qs}`)
      .then((r) => r.json())
      .then((d: { rows?: RequisitionRow[] }) => setAllRows(d.rows ?? []))
      .finally(() => setLoadingAll(false))
      .catch(() => setLoadingAll(false));
  }, [isRestock, isAdmin, filterDate]);

  React.useEffect(() => { loadMine(); }, [loadMine]);
  React.useEffect(() => { loadAll(); }, [loadAll]);

  async function handleMoveToRestock(r: RequisitionRow) {
    setMovingId(r.id);
    try {
      const res = await fetch("/api/requisitions/move", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: r.id, date: moveDate[r.id] ?? isoDate(round.deliveryDate) }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? t(lang, "requisitions.errMoveFailedGeneric"));
      loadAll();
    } catch (e: any) {
      window.alert(`${t(lang, "requisitions.errMoveFailedPrefix")}${e?.message ?? e}`);
    } finally {
      setMovingId(null);
    }
  }

  // เปิดหน้านี้ (list รวม) = ถือว่าเห็นคำขอค้างทั้งหมดแล้ว — เคลียร์ badge ให้ทั้งทีม (restock/admin)
  React.useEffect(() => {
    if (!(isRestock || isAdmin)) return;
    fetch("/api/requisitions/mark-seen", { method: "POST" }).catch(() => {});
  }, [isRestock, isAdmin]);

  async function handleSubmit() {
    const qn = parseFloat(qty);
    if (!qn || qn <= 0) { window.alert(t(lang, "requisitions.errQtyInvalid")); return; }
    const itemName = pickMode === "existing" ? (meta?.items.find((i) => i.id === itemId)?.name ?? "") : customName.trim();
    if (!itemName) { window.alert(pickMode === "existing" ? t(lang, "requisitions.errPickItem") : t(lang, "requisitions.errTypeItemName")); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/requisitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          branch,
          itemId: pickMode === "existing" ? itemId : undefined,
          itemName,
          qty: qn,
          unit: pickMode === "custom" ? customUnit.trim() : undefined,
          note: note.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? t(lang, "requisitions.errSubmitFailedGeneric"));
      setSubmitMsg(t(lang, "requisitions.newRequest.submitSuccess"));
      setItemId(""); setCustomName(""); setCustomUnit(""); setQty(""); setNote("");
      loadMine();
      loadAll();
      setTimeout(() => setSubmitMsg(null), 2500);
    } catch (e: any) {
      window.alert(`${t(lang, "requisitions.errSubmitFailedPrefix")}${e?.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageTitle title={t(lang, "nav.user.requisitions")} />

      {canSubmit && (
        <GlassCard className="mb-3">
          <h2 className="mb-3 text-[15px] font-semibold">{t(lang, "requisitions.newRequest.heading")}</h2>

          {notices.map((n) => (
            <div key={n.id} className="mb-3 rounded-xl border border-brand-orange/35 bg-brand-orange/[.08] px-3 py-2.5">
              <p className="text-[13px] font-semibold text-orange-700">{t(lang, "requisitions.newRequest.noticeTitle")}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-brand-ink/70">{n.message}</p>
            </div>
          ))}

          <div className="mb-3 rounded-xl border border-ok/25 bg-ok/[.06] px-3 py-2.5">
            <p className="text-[13px] font-semibold text-ok">
              {t(lang, "requisitions.newRequest.deliveryInfo", {
                day: t(lang, `requisitions.newRequest.dayNames.${round.deliveryDay}`),
                date: beDate(round.deliveryDate),
              })}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-brand-ink/55">
              {t(lang, "requisitions.newRequest.cutoffInfo", {
                day: t(lang, `requisitions.newRequest.dayNames.${round.cutoffDay}`),
                date: beDate(round.cutoffDate),
              })}
              <br />
              {t(lang, "requisitions.newRequest.nowInfo", {
                day: t(lang, `requisitions.newRequest.dayNames.${DAY_TH[now.getDay()]}`),
                date: beDate(now),
                time: now.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
              })}
            </p>
          </div>

          <div className="grid gap-2.5">
            <BranchPicker value={branch} onChange={setBranch} locked={scoped} />

            <div className="flex gap-1.5">
              <button
                type="button" onClick={() => setPickMode("existing")}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-medium transition ${
                  pickMode === "existing" ? "bg-brand-ink text-white" : "border border-black/5 bg-white/60 text-brand-ink"
                }`}
              >
                {t(lang, "requisitions.newRequest.pickExisting")}
              </button>
              <button
                type="button" onClick={() => setPickMode("custom")}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-medium transition ${
                  pickMode === "custom" ? "bg-brand-ink text-white" : "border border-black/5 bg-white/60 text-brand-ink"
                }`}
              >
                {t(lang, "requisitions.newRequest.pickCustom")}
              </button>
            </div>

            {pickMode === "existing" ? (
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-brand-ink/50">{t(lang, "requisitions.newRequest.itemLabel")}</span>
                <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="field">
                  <option value="">{t(lang, "requisitions.newRequest.itemPlaceholder")}</option>
                  {(meta?.items ?? []).map((it) => (
                    <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-brand-ink/50">{t(lang, "requisitions.newRequest.customNameLabel")}</span>
                  <input
                    value={customName} onChange={(e) => setCustomName(e.target.value)}
                    className="field" placeholder={t(lang, "requisitions.newRequest.customNamePlaceholder")}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-brand-ink/50">{t(lang, "requisitions.newRequest.customUnitLabel")}</span>
                  <input
                    value={customUnit} onChange={(e) => setCustomUnit(e.target.value)}
                    className="field" placeholder={t(lang, "requisitions.newRequest.customUnitPlaceholder")}
                  />
                </label>
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-brand-ink/50">{t(lang, "requisitions.newRequest.qtyLabel")}</span>
              <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className="field" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-brand-ink/50">{t(lang, "requisitions.newRequest.noteLabel")}</span>
              <input
                value={note} onChange={(e) => setNote(e.target.value)}
                className="field" placeholder={t(lang, "requisitions.newRequest.notePlaceholder")}
              />
            </label>

            <div className="rounded-xl border border-warn/30 bg-warn/[.06] px-3 py-2.5">
              <p className="text-[11px] leading-relaxed text-warn/90">
                {t(lang, "requisitions.newRequest.deliveryWarning")}
              </p>
            </div>

            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? t(lang, "requisitions.newRequest.submitting") : t(lang, "requisitions.newRequest.submitButton")}
            </Button>
            {submitMsg && <p className="text-center text-xs font-semibold text-ok">{submitMsg}</p>}
          </div>
        </GlassCard>
      )}

      {canSubmit && (
        <GlassCard className="mb-3">
          <h2 className="mb-2 text-[15px] font-semibold">{t(lang, "requisitions.myRequests.heading")}</h2>
          {myRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-brand-ink/50">{t(lang, "requisitions.myRequests.empty")}</p>
          ) : (
            <div className="grid gap-1.5">
              {myRows.map((r) => (
                <div key={r.id} className="rounded-lg bg-black/[.02] px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium">{fmtRow(r)}</span>
                    <span className="shrink-0 text-[10px] text-brand-ink/40">{fmtWhen(r.createdAt)}</span>
                  </div>
                  <div className="text-[11px] text-brand-ink/50">{r.branch}{r.note ? ` · ${r.note}` : ""}</div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}

      {(isRestock || isAdmin) && (
        <GlassCard>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold">{t(lang, "requisitions.allRequests.heading")}</h2>
            <span className="text-xs text-brand-ink/50">{t(lang, "requisitions.allRequests.itemCount", { n: allRows.length })}</span>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <input
              type="date" value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="rounded-lg border border-black/10 bg-white/70 px-2.5 py-1.5 text-xs"
            />
            {filterDate !== todayISO() && (
              <button
                type="button" onClick={() => setFilterDate(todayISO())}
                className="rounded-lg border border-black/5 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-brand-ink"
              >
                {t(lang, "requisitions.allRequests.todayButton")}
              </button>
            )}
            {filterDate && (
              <button
                type="button" onClick={() => setFilterDate("")}
                className="rounded-lg border border-black/5 bg-white/60 px-2.5 py-1.5 text-xs font-medium text-brand-ink"
              >
                {t(lang, "requisitions.allRequests.viewAllButton")}
              </button>
            )}
          </div>

          {loadingAll ? (
            <p className="py-4 text-center text-sm text-brand-ink/50">{t(lang, "requisitions.allRequests.loading")}</p>
          ) : allRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-brand-ink/50">
              {filterDate ? t(lang, "requisitions.allRequests.emptyToday") : t(lang, "requisitions.allRequests.emptyAll")}
            </p>
          ) : (
            <div className="grid gap-1.5">
              {allRows.map((r) => (
                <div key={r.id} className="rounded-lg bg-black/[.02] px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[13px] font-medium">{fmtRow(r)}</span>
                      <Badge tone="blue">{r.branch}</Badge>
                      {r.status === "moved" && <Badge tone="ok">{t(lang, "requisitions.allRequests.movedBadge")}</Badge>}
                    </div>
                    {r.status !== "moved" && (
                      <div className="flex shrink-0 items-center gap-1.5">
                        {/* เลือกวันที่ต้องเติมปลายทางได้เอง — ไม่แตะ = ใช้รอบส่งของถัดไปเหมือนเดิม (แพรขอ 2026-08-11) */}
                        <input
                          type="date"
                          value={moveDate[r.id] ?? isoDate(round.deliveryDate)}
                          onChange={(e) => setMoveDate((m) => ({ ...m, [r.id]: e.target.value }))}
                          className="rounded-lg border border-black/10 bg-white/70 px-2 py-1.5 text-[11px]"
                        />
                        <button
                          type="button"
                          onClick={() => handleMoveToRestock(r)}
                          disabled={movingId === r.id}
                          className="shrink-0 rounded-lg border border-black/10 bg-white/70 px-2.5 py-1.5 text-[11px] font-semibold text-brand-ink disabled:opacity-50"
                        >
                          {movingId === r.id ? t(lang, "requisitions.allRequests.movingButton") : t(lang, "requisitions.allRequests.moveButton")}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="text-[11px] text-brand-ink/50">
                    {r.requestedBy} · {fmtWhen(r.createdAt)}{r.note ? ` · ${r.note}` : ""}
                    {r.status === "moved" && r.movedBy ? `${t(lang, "requisitions.allRequests.movedByPrefix")}${r.movedBy}` : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}
