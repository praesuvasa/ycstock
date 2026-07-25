"use client";
// v1.9 · ยืนยันรับของ — พนักงานสาขาติ๊กรับจริงจากใบ "ต้องเติม" แก้จำนวนได้ถ้าไม่ตรง เพิ่มรายการนอกใบได้
// ไม่ผูกวันนี้อย่างเดียว โชว์ "ทุกใบที่ยังยืนยันไม่ครบ" เผื่อของมาส่งช้ากว่าที่นัด
// รับจริงที่ยืนยัน → auto-fill เข้าช่อง "รับเข้า" หน้าสต็อกของวันที่ติ๊กจริงทันที
// v1.9.2: ติ๊กเลือก/ไม่ได้รับ(แดง)เป็น draft ก่อน กด "ยืนยันทั้งหมด" ทีเดียว + "เลือกทั้งหมด"
// รายการที่ยืนยันไปแล้วยังกลับมาแก้ทีหลังได้ตามปกติ (บันทึกทันทีเมื่อแก้)
import React from "react";
import Link from "next/link";
import type { Branch, Item, Meta, RestockSheetSummary, RestockReceiptStatus, RestockReceiptBatchEntry } from "@/lib/types";
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
        กรุณาตรวจสอบรายการและจำนวนให้ถูกต้องก่อนกดยืนยันรับสินค้า
      </div>

      <GlassCard className="mb-3">
        <BranchPicker value={branch} onChange={(b) => { setBranch(b); setActiveDate(null); }} locked={scoped} />
      </GlassCard>

      {loadingSheets ? (
        <p className="py-8 text-center text-sm text-brand-ink/50">กำลังโหลด…</p>
      ) : sheets.length === 0 ? (
        <GlassCard>
          <div className="py-6 text-center">
            <p className="text-sm text-brand-ink/50">ยืนยันรับครบทุกใบแล้ว ✓</p>
            <p className="mt-1 text-xs text-brand-ink/40">
              หากต้องการตรวจสอบสินค้ารับเข้า สามารถตรวจสอบและแก้ไขได้ที่หน้า{" "}
              <Link href={`/stock?branch=${branch}`} className="font-medium text-brand-red underline underline-offset-2">
                สต็อก
              </Link>
            </p>
          </div>
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
                  ค้าง {s.pendingCount}/{s.totalCount}
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
type Selection = "received" | "notReceived";

function SheetConfirm({ branch, date, meta, onChanged }: {
  branch: Branch; date: string; meta: Meta | null; onChanged: () => void;
}) {
  const me = useMe();
  const isAdmin = me?.role === "admin";
  const [items, setItems] = React.useState<RestockReceiptStatus[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({});
  const [noteOpen, setNoteOpen] = React.useState<Record<string, boolean>>({});
  const [noteDrafts, setNoteDrafts] = React.useState<Record<string, string>>({});
  const [selection, setSelection] = React.useState<Record<string, Selection>>({});
  const [batchSubmitting, setBatchSubmitting] = React.useState(false);

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
  React.useEffect(() => { setSelection({}); setDrafts({}); }, [date]);

  // ใช้กับ: เพิ่มรายการนอกใบ (ทันที) + แก้ไขรายการที่ยืนยันไปแล้วก่อนหน้า (ทันที)
  async function submitOne(itemId: string, qty: number, qtyG: number, isExtra: boolean, note = "", notReceived = false) {
    await fetch("/api/confirm-receipt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ branch, date, itemId, receivedQty: qty, receivedQtyG: qtyG, isExtra, note, notReceived }),
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

  function handleEditCommit(item: RestockReceiptStatus) {
    const draft = drafts[item.itemId];
    if (!draft) return;
    const n = Number(draft.qty);
    const g = Number(draft.qtyG || "0");
    if (!Number.isFinite(n) || n < 0 || !Number.isFinite(g) || g < 0) return;
    if (item.receivedQty !== null && n === item.receivedQty && g === (item.receivedQtyG ?? 0)) return;
    submitOne(item.itemId, n, g, item.isExtra, noteDrafts[item.itemId] ?? item.note ?? "", false);
  }

  // แก้เฉพาะหมายเหตุ (ไม่แตะจำนวน) — ใช้ได้เฉพาะรายการที่ยืนยันรับแล้วเท่านั้น
  function handleNoteCommit(item: RestockReceiptStatus) {
    if (item.receivedQty === null) return; // ยังไม่ยืนยัน — หมายเหตุจะติดไปพร้อมตอนกด "ยืนยันทั้งหมด" แทน
    const draftNote = noteDrafts[item.itemId];
    if (draftNote === undefined || draftNote === (item.note ?? "")) return;
    const draft = drafts[item.itemId];
    const qty = draft ? Number(draft.qty) : item.receivedQty;
    const qtyG = draft ? Number(draft.qtyG || "0") : (item.receivedQtyG ?? 0);
    submitOne(item.itemId, qty, qtyG, item.isExtra, draftNote, item.notReceived);
  }

  function toggleSelection(itemId: string, mode: Selection) {
    setSelection((s) => {
      const next = { ...s };
      if (next[itemId] === mode) delete next[itemId];
      else next[itemId] = mode;
      return next;
    });
  }

  // ติ๊กช่องเขียว "ได้รับ" ออก → เด้งไปติ๊ก "ไม่ได้รับ" (แดง) ให้อัตโนมัติ แทนที่จะกลับไปว่างเปล่า
  function toggleReceived(itemId: string) {
    setSelection((s) => ({ ...s, [itemId]: s[itemId] === "received" ? "notReceived" : "received" }));
  }

  const pendingItems = items.filter((i) => i.receivedQty === null);
  // นับว่า "เลือกแล้ว" ไม่ว่าจะติ๊กได้รับหรือไม่ได้รับ — ทั้งคู่ถือว่าพนักงานตัดสินใจแล้ว
  const allSelected = pendingItems.length > 0 && pendingItems.every((item) => !!selection[item.itemId]);

  // กดครั้งแรก = เลือกทั้งหมด (ได้รับ) · กดซ้ำ (ตอนเลือกครบแล้ว) = เอาที่ติ๊กออกทั้งหมด
  function toggleSelectAll() {
    setSelection((s) => {
      const next = { ...s };
      for (const item of pendingItems) {
        if (allSelected) delete next[item.itemId];
        else next[item.itemId] = "received";
      }
      return next;
    });
  }

  async function confirmAllBatch() {
    const entries: RestockReceiptBatchEntry[] = pendingItems
      .filter((item) => !!selection[item.itemId])
      .map((item) => {
        const sel = selection[item.itemId];
        if (sel === "notReceived") {
          return { itemId: item.itemId, receivedQty: 0, receivedQtyG: 0, isExtra: item.isExtra, notReceived: true, note: noteDrafts[item.itemId] ?? "" };
        }
        const draft = drafts[item.itemId];
        const qty = draft ? Number(draft.qty) : item.orderedQty;
        const qtyG = draft ? Number(draft.qtyG || "0") : item.orderedQtyG;
        return { itemId: item.itemId, receivedQty: qty, receivedQtyG: qtyG, isExtra: item.isExtra, notReceived: false, note: noteDrafts[item.itemId] ?? "" };
      });
    if (entries.length === 0) { window.alert("เลือกอย่างน้อย 1 รายการก่อนกดยืนยัน"); return; }
    const receivedCount = entries.filter((e) => !e.notReceived).length;
    const notReceivedCount = entries.filter((e) => e.notReceived).length;
    if (!window.confirm(`ยืนยันรับ ${receivedCount} รายการ ไม่ได้รับ ${notReceivedCount} รายการ?`)) return;
    setBatchSubmitting(true);
    try {
      await fetch("/api/confirm-receipt/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, date, entries }),
      });
      setSelection({}); setDrafts({}); setNoteDrafts({});
      load();
      onChanged();
    } finally {
      setBatchSubmitting(false);
    }
  }

  // รายการที่เพิ่มนอกใบแล้ว + รายการในใบ ไม่ให้เลือกซ้ำในช่อง "เพิ่มรายการอื่น"
  const usedItemIds = new Set(items.map((i) => i.itemId));
  const extraCandidates = (meta?.items ?? []).filter((it) => !usedItemIds.has(it.id));

  if (loading) return <p className="py-8 text-center text-sm text-brand-ink/50">กำลังโหลด…</p>;

  return (
    <GlassCard>
      {pendingItems.length > 0 && (
        <button
          type="button"
          onClick={toggleSelectAll}
          className="mb-2 rounded-lg border border-black/10 bg-white/70 px-3 py-1.5 text-[12px] font-semibold text-brand-ink"
        >
          {allSelected ? "เอาที่เลือกออกทั้งหมด" : "เลือกทั้งหมด"}
        </button>
      )}
      <div className="grid gap-1">
        {items.map((item) => {
          const confirmed = item.receivedQty !== null;
          const sel = selection[item.itemId];
          const editable = confirmed ? !item.notReceived : sel === "received";
          const mismatch = confirmed && !item.isExtra && !item.notReceived
            && (item.receivedQty !== item.orderedQty || (item.receivedQtyG ?? 0) !== item.orderedQtyG);
          const draft = drafts[item.itemId];
          const qtyVal = draft?.qty ?? (confirmed ? String(item.receivedQty) : String(item.orderedQty));
          const qtyGVal = draft?.qtyG ?? (confirmed ? String(item.receivedQtyG ?? 0) : String(item.orderedQtyG));
          const noteVal = noteDrafts[item.itemId] ?? item.note ?? "";
          const isNoteOpen = !!noteOpen[item.itemId];

          const qtyOnBlur = confirmed ? () => handleEditCommit(item) : undefined;
          const noteOnBlur = confirmed ? () => handleNoteCommit(item) : undefined;

          return (
            <div key={item.itemId} className="rounded-lg bg-black/[.02] px-2 py-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={confirmed ? true : sel === "received"}
                  onChange={() => (confirmed ? handleUncheck(item) : toggleReceived(item.itemId))}
                  className="h-4 w-4 shrink-0 accent-ok"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium leading-tight">
                    {item.name} {item.isExtra && <Badge tone="orange">นอกใบ</Badge>}
                    {confirmed && item.notReceived && <Badge tone="warn">ไม่ได้รับ</Badge>}
                  </div>
                  <div className="truncate text-[10.5px] leading-tight text-brand-ink/45">
                    {item.isExtra ? "เพิ่มนอกใบเดิม" : `จำนวนตามเอกสาร ${item.orderedQty} ${item.unit}${item.orderedQtyG ? ` +${item.orderedQtyG}g` : ""}`}
                    {mismatch && (
                      <span className="text-warn"> · ได้รับจริง {item.receivedQty}{(item.receivedQtyG ?? 0) > 0 ? ` +${item.receivedQtyG}g` : ""}</span>
                    )}
                    {confirmed && !mismatch && !item.notReceived && <span className="text-ok"> · ตรวจรับแล้ว</span>}
                    {!confirmed && sel === "notReceived" && <span className="text-red-600"> · จะไม่บันทึกรับเข้า</span>}
                  </div>
                </div>
                {!(confirmed && item.notReceived) && (
                  <>
                    <input
                      inputMode="numeric"
                      maxLength={2}
                      value={qtyVal}
                      disabled={!editable}
                      onChange={(e) => setDrafts((d) => ({ ...d, [item.itemId]: { qty: e.target.value, qtyG: d[item.itemId]?.qtyG ?? qtyGVal } }))}
                      onBlur={qtyOnBlur}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className={`field w-9 shrink-0 px-1 py-1 text-center text-[12px] ${mismatch ? "border-warn/50 bg-warn/10" : ""} ${!editable ? "opacity-40" : ""}`}
                    />
                    {(showGrams(item.itemId) || item.isExtra) && (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <span className="text-[9.5px] text-brand-ink/40">+g</span>
                        <input
                          inputMode="numeric"
                          value={qtyGVal}
                          disabled={!editable}
                          onChange={(e) => setDrafts((d) => ({ ...d, [item.itemId]: { qty: d[item.itemId]?.qty ?? qtyVal, qtyG: e.target.value } }))}
                          onBlur={qtyOnBlur}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          className={`field w-10 shrink-0 px-1 py-1 text-center text-[12px] ${mismatch ? "border-warn/50 bg-warn/10" : ""} ${!editable ? "opacity-40" : ""}`}
                        />
                      </div>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setNoteOpen((o) => ({ ...o, [item.itemId]: !o[item.itemId] }))}
                  className="relative shrink-0 rounded-lg p-1 text-brand-ink/40 hover:bg-black/5"
                  aria-label="หมายเหตุ"
                >
                  📝
                  {!isNoteOpen && !!item.note && (
                    <span className="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-brand-red" />
                  )}
                </button>
                {!confirmed && isAdmin && (
                  <button
                    type="button"
                    onClick={() => removeItem(item)}
                    className="shrink-0 text-[10.5px] font-medium text-warn underline underline-offset-2"
                  >
                    ลบ
                  </button>
                )}
                {!confirmed && (
                  <input
                    type="checkbox"
                    checked={sel === "notReceived"}
                    onChange={() => toggleSelection(item.itemId, "notReceived")}
                    title="ไม่ได้รับ"
                    className="h-4 w-4 shrink-0 accent-warn"
                  />
                )}
              </div>

              {isNoteOpen && (
                <input
                  value={noteVal}
                  onChange={(e) => setNoteDrafts((d) => ({ ...d, [item.itemId]: e.target.value }))}
                  onBlur={noteOnBlur}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                  placeholder={confirmed ? "หมายเหตุ (ไม่บังคับ)" : "หมายเหตุ (ไม่บังคับ — บันทึกพร้อมกดยืนยันทั้งหมด)"}
                  className="field mt-1 w-full px-2 py-1 text-[12px]"
                />
              )}
            </div>
          );
        })}
      </div>

      <AddExtraItem candidates={extraCandidates} onAdd={(itemId, qty, qtyG) => submitOne(itemId, qty, qtyG, true)} />

      {pendingItems.length > 0 && (
        <button
          type="button"
          onClick={confirmAllBatch}
          disabled={batchSubmitting}
          className="mt-3 w-full rounded-xl bg-brand-red px-4 py-3 text-[15px] font-semibold text-white shadow-glass disabled:opacity-50"
        >
          {batchSubmitting ? "กำลังบันทึก…" : "ยืนยันทั้งหมด"}
        </button>
      )}
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 flex w-full items-center gap-2 rounded-lg border-t border-black/5 px-2.5 py-3 text-left text-[13px] font-medium text-brand-red"
      >
        + รายการอื่นๆที่รับเข้า
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
          placeholder="จำนวน (แพ็ค)" className="field flex-1"
        />
        <input
          inputMode="numeric" value={qtyG} onChange={(e) => setQtyG(e.target.value)}
          placeholder="เศษ (g)" className="field w-20"
        />
        <button
          type="button"
          onClick={() => {
            const n = Number(qty);
            const g = Number(qtyG || "0");
            if (!itemId || !Number.isFinite(n) || n <= 0 || !Number.isFinite(g) || g < 0) {
              window.alert("เลือกรายการและกรอกจำนวนให้ถูกต้อง"); return;
            }
            if (n > 15) {
              window.alert("จำนวนแพ็คต้องไม่เกิน 15 ต่อรายการ"); return;
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
