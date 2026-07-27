"use client";
// v1.12 · ตรวจวันหมดอายุ — รอบตรวจ อังคาร + ศุกร์ (รถเข้า พุธ + เสาร์ → ตรวจก่อน 1 วัน ของส่งคืนขึ้นรถทัน)
//
// แนวคิดที่ตกลงกับแพร: ไม่กรอกวันหมดอายุตอนรับของ เพราะคุมลูกค้าไม่ได้ (ลูกค้าหยิบของหมดอายุช้าสุดก่อน)
// ยังไงก็ต้องเดินดูของจริงบนชั้น → นับของจริงทุกรอบตรวจแทน ไม่เชื่อตัวเลขเก่า
//
// ปลายทางมี 2 ทาง: แกะขายหน้าร้าน (ลง ขาย/ใช้) · ส่งคืนครัวกลาง (ลง ส่งคืน/เสีย) — ของทิ้งก็ส่งคืน ไม่ทิ้งเอง
import React from "react";
import type { Branch, Item, Meta, ExpiryCheckRow, ExpiryDisposition } from "@/lib/types";
import { useMe, EXPIRY_SAVED_EVENT } from "@/components/nav";
import { GlassCard, BranchPicker, PageTitle, Badge, Button, SaveBar, Stat } from "@/components/ui";
import { todayISO, thaiDate } from "@/lib/fmt";
import { weekdayFromDate, isExpiryCheckDue, expiryStatus, daysUntil, effectiveWarnDays } from "@/lib/calc";

// แถวบนหน้าจอ = 1 ชุดวันหมดอายุ · ให้ key ท้องถิ่นไว้ track ตอนแก้/ลบ (ยังไม่มี id จาก DB ตอนเพิ่งเพิ่ม)
interface Draft extends ExpiryCheckRow {
  key: string;
}
let seq = 0;
const newDraft = (itemId: string): Draft => ({
  key: `d${++seq}`, itemId, expiryDate: "", qty: 0, disposition: null, note: "",
});

const STATUS_STYLE = {
  expired: { label: "หมดอายุแล้ว", tone: "warn" as const, bar: "border-l-brand-red" },
  near: { label: "ใกล้หมดอายุ", tone: "orange" as const, bar: "border-l-brand-orange" },
  ok: { label: "ยังไม่ใกล้หมด", tone: "ok" as const, bar: "border-l-ok" },
};

export default function ExpiryPage() {
  const me = useMe();
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
      if (convertReady) out.push({ v: "convert", label: `แกะรวมกับ ${nameById.get(convertTo!) ?? "รายการอื่น"}` });
      else if (!convertTo) out.push({ v: "sell_front", label: "แกะขายหน้าร้าน" });
    }
    if (it.expiryAllowReturn !== false) out.push({ v: "return", label: "ส่งคืนครัวกลาง" });
    return out;
  }, [nameById]);

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

  async function save() {
    if (pendingDecision.length > 0) {
      const ok = window.confirm(
        `มี ${pendingDecision.length} ชุดที่ใกล้/หมดอายุแล้วแต่ยังไม่ได้เลือกปลายทาง\n` +
        `ถ้าบันทึกตอนนี้ ระบบจะถือว่ายังวางขายต่อ (ไม่ลงสต็อก)\n\nต้องการบันทึกเลยไหม?`
      );
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
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "บันทึกไม่สำเร็จ");
      window.dispatchEvent(new Event(EXPIRY_SAVED_EVENT)); // ให้ badge ที่เมนูหายทันที
      window.alert(`บันทึกผลตรวจแล้ว ✓\nส่งคืน ${countReturn} ชุด · แกะออกจากชั้น ${countSell} ชุด`);
      load();
    } catch (e: any) {
      setErr(e?.message ?? "บันทึกไม่สำเร็จ");
      window.alert(e?.message ?? "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-28">
      <PageTitle title="ตรวจวันหมดอายุ" right={<Badge tone="blue">{thaiDate(date)}</Badge>} />

      <GlassCard className="mb-3">
        <div className="grid gap-3">
          <BranchPicker value={branch} onChange={setBranch} locked={scoped} />
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">วันที่ตรวจ</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
          </label>
          {isDue ? (
            <p className="rounded-lg bg-warn/10 px-2.5 py-2 text-[12px] font-medium text-warn">
              ถึงรอบตรวจวันนี้ — ตรวจก่อนรถเข้าพรุ่งนี้ ของส่งคืนจะได้ขึ้นรถทัน
            </p>
          ) : (
            <p className="rounded-lg bg-black/[.03] px-2.5 py-2 text-[11.5px] leading-relaxed text-brand-ink/55">
              วันนี้ไม่ใช่รอบตรวจ (รอบปกติคือ อังคาร + ศุกร์) — ยังบันทึกได้ถ้าต้องตรวจนอกรอบ
            </p>
          )}
        </div>
      </GlassCard>

      <div className="mb-3 rounded-lg border border-black/10 bg-black/[.02] px-3 py-2.5 text-[12px] leading-relaxed text-brand-ink/60">
        เดินดูของบนชั้น แล้วกรอก <b>วันหมดอายุที่ใกล้ที่สุดที่เจอ</b> พร้อมจำนวนของวันนั้น —
        นับของจริงทุกครั้ง ไม่ต้องอิงตัวเลขรอบก่อน (ลูกค้าหยิบไม่เรียงวันหมดอายุ)
      </div>

      {err && (
        <div className="mb-3 rounded-xl border border-brand-red/30 bg-brand-red/10 px-3.5 py-2.5 text-sm text-brand-red">
          {err}
        </div>
      )}

      {loading ? (
        <p className="py-8 text-center text-sm text-brand-ink/50">กำลังโหลด…</p>
      ) : items.length === 0 ? (
        <GlassCard>
          <p className="py-8 text-center text-sm text-brand-ink/50">
            สาขานี้ยังไม่มีรายการที่ตั้งให้ตรวจวันหมดอายุ
          </p>
        </GlassCard>
      ) : (
        <div className="grid gap-3">
          {groups.map((g) => (
            <GlassCard key={g.category}>
              <p className="mb-2 text-[11px] uppercase tracking-wide text-brand-ink/45">{g.category}</p>
              <div className="grid gap-2">
                {g.items.map((it) => {
                  const rows = rowsOf(it.id);
                  const opts = optionsFor(it);
                  return (
                    <div key={it.id} className="rounded-lg bg-black/[.02] px-2.5 py-2">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{it.name}</span>
                        <span className="shrink-0 text-[10.5px] text-brand-ink/40">
                          เตือนล่วงหน้า {effectiveWarnDays(it.expiryWarnDays ?? 5, weekday)} วัน
                        </span>
                      </div>

                      {rows.length === 0 && (
                        <p className="mb-1.5 text-[11px] text-brand-ink/40">ยังไม่ได้กรอก</p>
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
                            <div className="flex items-end gap-1.5">
                              <label className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="text-[9.5px] text-brand-ink/45">วันหมดอายุ</span>
                                <input
                                  type="date" value={d.expiryDate}
                                  onChange={(e) => patch(d.key, { expiryDate: e.target.value })}
                                  className="field px-1.5 py-1 text-[12px]"
                                />
                              </label>
                              <label className="flex w-14 shrink-0 flex-col gap-0.5">
                                <span className="text-[9.5px] text-brand-ink/45">จำนวน</span>
                                <input
                                  inputMode="numeric" value={d.qty || ""}
                                  onChange={(e) => patch(d.key, { qty: Number(e.target.value) || 0 })}
                                  className="field px-1 py-1 text-center text-[12px]"
                                />
                              </label>
                              <button
                                type="button" onClick={() => removeRow(d.key)}
                                className="shrink-0 pb-1 text-[10.5px] font-medium text-warn underline underline-offset-2"
                              >
                                ลบ
                              </button>
                            </div>

                            {style && (
                              <div className="mt-1 flex items-center gap-1.5">
                                <Badge tone={style.tone}>{style.label}</Badge>
                                {left !== null && (
                                  <span className="text-[10.5px] text-brand-ink/45">
                                    {left < 0 ? `เลยมา ${-left} วัน` : left === 0 ? "หมดอายุวันนี้" : `อีก ${left} วัน`}
                                  </span>
                                )}
                              </div>
                            )}

                            {needDecision && opts.length === 0 && (
                              <p className="mt-1.5 rounded-lg bg-warn/10 px-2 py-1.5 text-[10.5px] leading-relaxed text-warn">
                                รายการนี้ยังไม่ได้ตั้งปลายทางไว้ — แจ้งแอดมินก่อนจัดการของชุดนี้
                              </p>
                            )}

                            {needDecision && opts.length > 0 && (
                              <div className="mt-1.5">
                                <p className="mb-1 text-[10.5px] text-brand-ink/50">ทำอย่างไรกับของชุดนี้</p>
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
                        + เพิ่มวันหมดอายุ{rows.length > 0 ? "อีกชุด" : ""}
                      </button>
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          ))}
        </div>
      )}

      {!loading && items.length > 0 && (
        <SaveBar>
          <div className="mb-2 grid grid-cols-3 gap-2">
            <Stat label="ส่งคืน" value={`${countReturn}`} tone={countReturn > 0 ? "warn" : "default"} />
            <Stat label="แกะออกจากชั้น" value={`${countSell}`} tone={countSell > 0 ? "ok" : "default"} />
            <Stat label="ตรวจแล้ว" value={`${itemsChecked}/${items.length}`} />
          </div>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? "กำลังบันทึก…" : "บันทึกผลตรวจ"}
          </Button>
          <p className="mt-1.5 text-center text-[10.5px] leading-relaxed text-brand-ink/45">
            ทุกปลายทางลงหน้าสต็อกให้เอง — ส่งคืนเข้าช่องส่งคืน · แกะออกจากชั้นเข้าช่องขาย/ใช้
            · แกะรวมยังไปบวก &ldquo;รับเข้า&rdquo; ให้รายการปลายทางด้วย ไม่ต้องกรอกซ้ำที่ไหน
          </p>
        </SaveBar>
      )}
    </div>
  );
}
