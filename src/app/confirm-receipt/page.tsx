"use client";
// v1.9 · ยืนยันรับของ — พนักงานสาขาติ๊กรับจริงจากใบ "ต้องเติม" แก้จำนวนได้ถ้าไม่ตรง เพิ่มรายการนอกใบได้
// ไม่ผูกวันนี้อย่างเดียว โชว์ "ทุกใบที่ยังยืนยันไม่ครบ" เผื่อของมาส่งช้ากว่าที่นัด
// รับจริงที่ยืนยัน → auto-fill เข้าช่อง "รับเข้า" หน้าสต็อกของวันที่ติ๊กจริงทันที
// v1.9.1: ติ๊กออกได้ (กันพลาดติ๊ก) + กรอกเศษกรัมได้สำหรับรายการที่นับเศษ
import React from "react";
import type { Branch, Item, Meta, RestockSheetSummary, RestockReceiptStatus } from "@/lib/types";
import { useMe } from "@/components/nav";
import { GlassCard, BranchPicker, PageTitle, Badge } from "@/components/ui";
import { thaiDate } from "@/lib/fmt";

export default function ConfirmReceiptPage() {
  const me = useMe();
  const scoped = !!me && me.branchScope !== "all";
  const [branch, setBranch] = React.useState<Branch>("NVP");
  React.useEffect(() => {
    if (scoped) setBranch(me!.branchScope as Branch);
  }, [scoped, me]);

  const [meta, setMeta] = React.useState<Meta | null>(null);
  React.useEffect(() => {
    fetch("/api/meta").then((r) => r.json()).then((m: Meta) => setMeta(m)).catch(() => {});
  }, []);

  const [sheets, setSheets] = React.useState<RestockSheetSummary[]>([]);
  const [loadingSheets, setLoadingSheets] = React.useState(true);
  const loadSheets = React.useCallback(() => {
    setLoadingSheets(true);
    fetch(`/api/confirm-receipt/sheets?branch=${branch}`)
      .then((r) => r.json())
      .then((d: { sheets?: RestockSheetSummary[] }) => setSheets(d.sheets ?? []))
      .finally(() => setLoadingSheets(false))
      .catch(() => setLoadingSheets(false));
  }, [branch]);
  React.useEffect(() => { loadSheets(); }, [loadSheets]);

  const [activeDate, setActiveDate] = React.useState<string | null>(null);
  React.useEffect(() => {
    // เลือกใบแรกในลิสอัตโนมัติ (เก่าสุดก่อน) — ถ้าใบที่เลือกอยู่หายไปแล้ว (ยืนยันครบ) ให้รีเซ็ต
    if (activeDate && sheets.some((s) => s.date === activeDate)) return;
    setActiveDate(sheets[0]?.date ?? null);
  }, [sheets, activeDate]);

  return (
    <div>
      <PageTitle title="ยืนยันรับของ" />

      <div className="mb-3 rounded-lg border border-warn/30 bg-warn/[.06] px-3 py-2.5 text-[12px] leading-relaxed text-warn">
        ติ๊กเฉพาะรายการที่ได้รับของจริงแล้วเท่านั้น — หากสินค้ายังไม่จัดส่งถึง อย่ายืนยันรับ (พลาดติ๊กไป กดที่ช่องติ๊กอีกครั้งเพื่อยกเลิกได้)
      </div>

      <GlassCard className="mb-3">
        <BranchPicker value={branch} onChange={(b) => { setBranch(b); setActiveDate(null); }} locked={scoped} />
      </GlassCard>

      {loadingSheets ? (
        <p className="py-8 text-center text-sm text-brand-ink/50">กำลังโหลด…</p>
      ) : sheets.length === 0 ? (
        <GlassCard>
          <p className="py-6 text-center text-sm text-brand-ink/50">ยืนยันรับครบทุกใบแล้ว ✓</p>
        </GlassCard>
      ) : (
        <>
          <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
            {sheets.map((s) => (
              <button
                key={s.date}
                onClick={() => setActiveDate(s.date)}
                className={`shrink-0 rounded-xl px-3 py-2 text-left text-xs font-medium transition ${
                  activeDate === s.date ? "bg-brand-ink text-white" : "border border-black/5 bg-white/60 text-brand-ink"
                }`}
              >
                <div>ใบ {thaiDate(s.date)}</div>
                <div className={activeDate === s.date ? "text-white/70" : "text-brand-ink/45"}>
                  ค้าง {s.pendingCount}/{s.totalCount} {s.isPastCutoff && "⚠️"}
                </div>
              </button>
            ))}
          </div>

          {activeDate && (
            <SheetConfirm
              branch={branch}
              date={activeDate}
              meta={meta}
              onChanged={loadSheets}
            />
          )}
        </>
      )}
    </div>
  );
}

interface Draft { qty: string; qtyG: string }

function SheetConfirm({ branch, date, meta, onChanged }: {
  branch: Branch; date: string; meta: Meta | null; onChanged: () => void;
}) {
  const me = useMe();
  const isAdmin = me?.role === "admin";
  const [items, setItems] = React.useState<RestockReceiptStatus[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});

  const itemMeta = React.useMemo(() => new Map((meta?.items ?? []).map((it) => [it.id, it])), [meta]);
  const showGrams = (itemId: string) => {
    const it = itemMeta.get(itemId);
    return !!it && (it.hasRemainder || it.variableYield);
  };

  const load = React.useCallback(() => {
    setLoading(true);
    fetch(`/api/confirm-receipt?branch=${branch}&date=${date}`)
      .then((r) => r.json())
      .then((d: { items?: RestockReceiptStatus[] }) => setItems(d.items ?? []))
      .finally(() => setLoading(false))
      .catch(() => setLoading(false));
  }, [branch, date]);
  React.useEffect(() => { load(); }, [load]);

  async function submit(itemId: string, qty: number, qtyG: number, isExtra: boolean) {
    await fetch("/api/confirm-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch, date, itemId, receivedQty: qty, receivedQtyG: qtyG, isExtra }),
    });
    setDrafts((d) => { const { [itemId]: _drop, ...rest } = d; return rest; });
    load();
    onChanged();
  }

  async function handleUncheck(item: RestockReceiptStatus) {
    if (!window.confirm(`ยกเลิกยืนยันรับ "${item.name}"? (พลาดติ๊กไป)`)) return;
    await fetch("/api/confirm-receipt", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch, date, itemId: item.itemId }),
    });
    setDrafts((d) => { const { [item.itemId]: _drop, ...rest } = d; return rest; });
    load();
    onChanged();
  }

  // admin เท่านั้น — ยกเลิกรายการที่ยังไม่ยืนยันรับ (เช่น สั่งผิด/ไม่เอาแล้ว) ให้หายจากลิสค้าง
  async function removeItem(item: RestockReceiptStatus) {
    if (!window.confirm(`ลบรายการ "${item.name}" ออกจากใบนี้? (รายการนี้จะไม่ค้างให้ยืนยันรับอีก)`)) return;
    await fetch("/api/restock/selections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branch, date,
        entries: [{ itemId: item.itemId, selected: false, qty: item.orderedQty, qtyG: item.orderedQtyG }],
      }),
    });
    load();
    onChanged();
  }

  function handleCheck(item: RestockReceiptStatus) {
    submit(item.itemId, item.orderedQty, item.orderedQtyG, false);
  }

  function handleEditCommit(item: RestockReceiptStatus) {
    const draft = drafts[item.itemId];
    if (!draft) return;
    const n = Number(draft.qty);
    const g = Number(draft.qtyG || "0");
    if (!Number.isFinite(n) || n < 0 || !Number.isFinite(g) || g < 0) return;
    if (item.receivedQty !== null && n === item.receivedQty && g === (item.receivedQtyG ?? 0)) return;
    submit(item.itemId, n, g, item.isExtra);
  }

  // รายการที่เพิ่มนอกใบแล้ว + รายการในใบ ไม่ให้เลือกซ้ำในช่อง "เพิ่มรายการอื่น"
  const usedItemIds = new Set(items.map((i) => i.itemId));
  const extraCandidates = (meta?.items ?? []).filter((it) => !usedItemIds.has(it.id));

  if (loading) return <p className="py-8 text-center text-sm text-brand-ink/50">กำลังโหลด…</p>;

  return (
    <GlassCard>
      <div className="grid gap-1.5">
        {items.map((item) => {
          const confirmed = item.receivedQty !== null;
          const mismatch = confirmed && !item.isExtra
            && (item.receivedQty !== item.orderedQty || (item.receivedQtyG ?? 0) !== item.orderedQtyG);
          const draft = drafts[item.itemId];
          const qtyVal = draft?.qty ?? (confirmed ? String(item.receivedQty) : String(item.orderedQty));
          const qtyGVal = draft?.qtyG ?? (confirmed ? String(item.receivedQtyG ?? 0) : String(item.orderedQtyG));
          return (
            <div key={item.itemId} className="flex items-center gap-2.5 rounded-lg bg-black/[.02] px-2.5 py-2.5">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={() => (confirmed ? handleUncheck(item) : handleCheck(item))}
                className="h-[18px] w-[18px] shrink-0 accent-brand-red"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">
                  {item.name} {item.isExtra && <Badge tone="orange">นอกใบ</Badge>}
                </div>
                <div className="text-[11px] text-brand-ink/45">
                  {item.isExtra ? "เพิ่มนอกใบเดิม" : `สั่งไว้ ${item.orderedQty} ${item.unit}${item.orderedQtyG ? ` +${item.orderedQtyG}g` : ""}`}
                  {mismatch && (
                    <span className="text-warn"> · ได้รับจริง {item.receivedQty}{(item.receivedQtyG ?? 0) > 0 ? ` +${item.receivedQtyG}g` : ""}</span>
                  )}
                </div>
              </div>
              <input
                inputMode="numeric"
                value={qtyVal}
                disabled={!confirmed}
                onChange={(e) => setDrafts((d) => ({ ...d, [item.itemId]: { qty: e.target.value, qtyG: d[item.itemId]?.qtyG ?? qtyGVal } }))}
                onBlur={() => handleEditCommit(item)}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                className={`field w-14 shrink-0 text-right ${mismatch ? "border-warn/50 bg-warn/10" : ""} ${!confirmed ? "opacity-40" : ""}`}
              />
              {(showGrams(item.itemId) || item.isExtra) && (
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-[11px] text-brand-ink/40">+g</span>
                  <input
                    inputMode="numeric"
                    value={qtyGVal}
                    disabled={!confirmed}
                    onChange={(e) => setDrafts((d) => ({ ...d, [item.itemId]: { qty: d[item.itemId]?.qty ?? qtyVal, qtyG: e.target.value } }))}
                    onBlur={() => handleEditCommit(item)}
                    onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                    className={`field w-12 shrink-0 text-right ${mismatch ? "border-warn/50 bg-warn/10" : ""} ${!confirmed ? "opacity-40" : ""}`}
                  />
                </div>
              )}
              {!confirmed && isAdmin && (
                <button
                  type="button"
                  onClick={() => removeItem(item)}
                  className="shrink-0 text-[11px] font-medium text-warn underline underline-offset-2"
                >
                  ลบ
                </button>
              )}
            </div>
          );
        })}
      </div>

      <AddExtraItem candidates={extraCandidates} onAdd={(itemId, qty, qtyG) => submit(itemId, qty, qtyG, true)} />
    </GlassCard>
  );
}

function AddExtraItem({ candidates, onAdd }: {
  candidates: Item[];
  onAdd: (itemId: string, qty: number, qtyG: number) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [filter, setFilter] = React.useState("");
  const [itemId, setItemId] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [qtyG, setQtyG] = React.useState("");

  const filtered = filter.trim()
    ? candidates.filter((c) => c.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : candidates;
  const selected = candidates.find((c) => c.id === itemId);
  const showGrams = !!selected && (selected.hasRemainder || selected.variableYield);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 flex w-full items-center gap-2 rounded-lg border-t border-black/5 px-2.5 py-3 text-left text-[13px] font-medium text-brand-red"
      >
        + เพิ่มรายการอื่นนอกเหนือจากที่สั่ง
      </button>
    );
  }
  return (
    <div className="mt-2 grid gap-2 rounded-lg border-t border-black/5 bg-black/[.02] px-2.5 py-3">
      <input
        value={filter} onChange={(e) => setFilter(e.target.value)}
        placeholder="พิมพ์ค้นหาชื่อสินค้า…" className="field"
      />
      <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="field">
        <option value="">— เลือกรายการ —</option>
        {filtered.map((c) => (
          <option key={c.id} value={c.id}>{c.name} ({c.unit})</option>
        ))}
      </select>
      <div className="flex gap-2">
        <input
          inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)}
          placeholder="จำนวน" className="field flex-1"
        />
        {showGrams && (
          <input
            inputMode="numeric" value={qtyG} onChange={(e) => setQtyG(e.target.value)}
            placeholder="เศษ (g)" className="field w-20"
          />
        )}
        <button
          type="button"
          onClick={() => {
            const n = Number(qty);
            const g = Number(qtyG || "0");
            if (!itemId || !Number.isFinite(n) || n <= 0 || !Number.isFinite(g) || g < 0) {
              window.alert("เลือกรายการและกรอกจำนวนให้ถูกต้อง"); return;
            }
            onAdd(itemId, n, g);
            setOpen(false); setFilter(""); setItemId(""); setQty(""); setQtyG("");
          }}
          className="shrink-0 rounded-xl border border-black/10 bg-white/70 px-4 text-sm font-semibold text-brand-ink"
        >
          เพิ่ม
        </button>
      </div>
    </div>
  );
}
