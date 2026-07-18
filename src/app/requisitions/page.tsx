"use client";
// M4 · ขอเบิกสินค้า — พนักงานสาขา (user/admin) ส่งคำขอของเกิน Par หรือของนอกลิสต์
// ไม่มีสถานะติดตาม (ยืนยันกับแพรแล้ว) — แค่ list ให้ restock/admin กวาดดูตอนเตรียมสั่งผลิต/เติมของ
import React from "react";
import type { Branch, Meta } from "@/lib/types";
import { useMe } from "@/components/nav";
import { GlassCard, BranchPicker, PageTitle, Button, Badge } from "@/components/ui";

interface RequisitionRow {
  id: string; branch: Branch; itemId?: string; itemName: string; qty: number; unit?: string;
  note: string; requestedBy: string; createdAt: string;
}

type PickMode = "existing" | "custom";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}
function fmtRow(r: RequisitionRow): string {
  return `${r.itemName}${r.unit ? ` (${r.unit})` : ""} × ${r.qty}`;
}

export default function RequisitionsPage() {
  const me = useMe();
  const isRestock = me?.role === "restock";
  const isAdmin = me?.role === "admin";
  const canSubmit = me?.role === "user" || isAdmin;
  const scoped = !!me && me.branchScope !== "all";

  const [branch, setBranch] = React.useState<Branch>("NVP");
  React.useEffect(() => {
    if (scoped) setBranch(me!.branchScope as Branch);
  }, [scoped, me]);

  const [meta, setMeta] = React.useState<Meta | null>(null);
  React.useEffect(() => {
    fetch("/api/meta").then((r) => r.json()).then((m: Meta) => setMeta(m)).catch(() => {});
  }, []);

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
    fetch("/api/requisitions")
      .then((r) => r.json())
      .then((d: { rows?: RequisitionRow[] }) => setAllRows(d.rows ?? []))
      .finally(() => setLoadingAll(false))
      .catch(() => setLoadingAll(false));
  }, [isRestock, isAdmin]);

  React.useEffect(() => { loadMine(); }, [loadMine]);
  React.useEffect(() => { loadAll(); }, [loadAll]);

  // เปิดหน้านี้ (list รวม) = ถือว่าเห็นคำขอค้างทั้งหมดแล้ว — เคลียร์ badge ให้ทั้งทีม (restock/admin)
  React.useEffect(() => {
    if (!(isRestock || isAdmin)) return;
    fetch("/api/requisitions/mark-seen", { method: "POST" }).catch(() => {});
  }, [isRestock, isAdmin]);

  async function handleSubmit() {
    const qn = parseFloat(qty);
    if (!qn || qn <= 0) { window.alert("กรอกจำนวนให้ถูกต้อง"); return; }
    const itemName = pickMode === "existing" ? (meta?.items.find((i) => i.id === itemId)?.name ?? "") : customName.trim();
    if (!itemName) { window.alert(pickMode === "existing" ? "เลือกรายการก่อน" : "พิมพ์ชื่อรายการก่อน"); return; }

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
      if (!res.ok || data.error) throw new Error(data.error ?? "ส่งคำขอไม่สำเร็จ");
      setSubmitMsg("✓ ส่งคำขอแล้ว");
      setItemId(""); setCustomName(""); setCustomUnit(""); setQty(""); setNote("");
      loadMine();
      loadAll();
      setTimeout(() => setSubmitMsg(null), 2500);
    } catch (e: any) {
      window.alert(`ส่งไม่สำเร็จ: ${e?.message ?? e}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageTitle title="ขอเบิกสินค้า" />

      {canSubmit && (
        <GlassCard className="mb-3">
          <h2 className="mb-3 text-[15px] font-semibold">ส่งคำขอใหม่</h2>
          <div className="grid gap-2.5">
            <BranchPicker value={branch} onChange={setBranch} locked={scoped} />

            <div className="flex gap-1.5">
              <button
                type="button" onClick={() => setPickMode("existing")}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-medium transition ${
                  pickMode === "existing" ? "bg-brand-ink text-white" : "border border-black/5 bg-white/60 text-brand-ink"
                }`}
              >
                เลือกจากรายการ
              </button>
              <button
                type="button" onClick={() => setPickMode("custom")}
                className={`flex-1 rounded-xl px-3 py-2 text-xs font-medium transition ${
                  pickMode === "custom" ? "bg-brand-ink text-white" : "border border-black/5 bg-white/60 text-brand-ink"
                }`}
              >
                พิมพ์เอง (ไม่มีในระบบ)
              </button>
            </div>

            {pickMode === "existing" ? (
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-brand-ink/50">รายการ</span>
                <select value={itemId} onChange={(e) => setItemId(e.target.value)} className="field">
                  <option value="">— เลือกรายการ —</option>
                  {(meta?.items ?? []).map((it) => (
                    <option key={it.id} value={it.id}>{it.name} ({it.unit})</option>
                  ))}
                </select>
              </label>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-brand-ink/50">ชื่อรายการ</span>
                  <input
                    value={customName} onChange={(e) => setCustomName(e.target.value)}
                    className="field" placeholder="เช่น แก้วพิเศษงานอีเวนต์"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] text-brand-ink/50">หน่วย</span>
                  <input
                    value={customUnit} onChange={(e) => setCustomUnit(e.target.value)}
                    className="field" placeholder="เช่น ชิ้น/แพ็ค"
                  />
                </label>
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-brand-ink/50">จำนวน</span>
              <input inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className="field" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-brand-ink/50">เหตุผล / โอกาสพิเศษ (ถ้ามี)</span>
              <input
                value={note} onChange={(e) => setNote(e.target.value)}
                className="field" placeholder="เช่น อีเวนต์วันเสาร์ ลูกค้าเยอะกว่าปกติ"
              />
            </label>

            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? "กำลังส่ง…" : "ส่งคำขอเบิก"}
            </Button>
            {submitMsg && <p className="text-center text-xs font-semibold text-ok">{submitMsg}</p>}
          </div>
        </GlassCard>
      )}

      {canSubmit && (
        <GlassCard className="mb-3">
          <h2 className="mb-2 text-[15px] font-semibold">คำขอของฉัน</h2>
          {myRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-brand-ink/50">ยังไม่เคยส่งคำขอ</p>
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
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold">คำขอเบิกทั้งหมด (ทุกสาขา)</h2>
            <span className="text-xs text-brand-ink/50">{allRows.length} รายการล่าสุด</span>
          </div>
          {loadingAll ? (
            <p className="py-4 text-center text-sm text-brand-ink/50">กำลังโหลด…</p>
          ) : allRows.length === 0 ? (
            <p className="py-4 text-center text-sm text-brand-ink/50">ยังไม่มีคำขอเบิก</p>
          ) : (
            <div className="grid gap-1.5">
              {allRows.map((r) => (
                <div key={r.id} className="rounded-lg bg-black/[.02] px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium">{fmtRow(r)}</span>
                    <Badge tone="blue">{r.branch}</Badge>
                  </div>
                  <div className="text-[11px] text-brand-ink/50">
                    {r.requestedBy} · {fmtWhen(r.createdAt)}{r.note ? ` · ${r.note}` : ""}
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
