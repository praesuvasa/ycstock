"use client";
// M2 · Restock — 2 โหมดสลับด้วย toggle บนสุด
//  A) "ต้องเติมรายสาขา" (ของเดิม ปรับปรุง UI): จัดกลุ่มตาม category + เลือกรายการ + จำนวนสั่งแก้ได้อิสระ + export CSV
//  B) "สั่งผลิต (รวมทุกสาขา)": รายชื่อไอเทมสั่งผลิต hardcode คงที่ 2 แผนก กรอกจำนวนต่อสาขา + export CSV
// business logic เดิมของโหมด A (fetch /api/restock, specialActive, specialDayLabel) คงไว้เป๊ะ — เปลี่ยนแค่ presentation
import React from "react";
import { GlassCard, Segmented, BranchPicker, Badge, PageTitle, Accordion } from "@/components/ui";
import { useMe } from "@/components/nav";
import type { Branch, Weekday, RestockRow, Meta, Item } from "@/lib/types";
import { specialDayLabel } from "@/lib/calc";
import { todayISO } from "@/lib/fmt";

const DAY_LABEL: Record<Weekday, string> = { wed: "วันพุธ", sat: "วันเสาร์" };
const DAY_OPTS = [
  { value: "wed" as Weekday, label: "วันพุธ" },
  { value: "sat" as Weekday, label: "วันเสาร์" },
];

type Mode = "byBranch" | "production";
const MODE_OPTS = [
  { value: "byBranch" as Mode, label: "📦 ต้องเติมรายสาขา" },
  { value: "production" as Mode, label: "🏭 สั่งผลิต (รวมทุกสาขา)" },
];

// ── โหมด B: รายชื่อไอเทม "สั่งผลิต" hardcode (ยืนยันแล้วว่าไม่ต้องการ config ต่อไอเทมใน Settings) ──
const PRODUCTION_ITEMS_MAIN = [
  "Greek Yogurt 1kg", "Biscoff", "Plain Yogurt (ธรรมชาติ)",
  "Greek Yogurt 500g", "Plain Yogurt 500g",
  "น้ำ Ice cream / Soft Serve",
  "ถุงสตรอเบอรี่", "ถุงบลูเบอรี่", "ถุงธรรมชาติ", "ถุงลิ้นจี่", "ถุงยูส", "ถุงพีช",
  "Cornflakes Malt (M)", "Granola (M)",
];
const PRODUCTION_ITEMS_DEPT2 = [
  "Overnight oats biscoff", "พิสตาชิโอ้เครป", "พิสตาชิโอ้บัตเตอร์", "พิสตาชิโอ้ท๊อปปิ้ง",
  "ซอส Chocolate", "Choc Chip Cookies", "Cranberry Cookies",
];
// ไอเทมใหม่ล่าสุด (badge เล็กๆ กำกับ — ไม่บังคับ)
const NEW_ITEM_NAMES = ["Cranberry Cookies"];

// ── CSV helpers (ใช้ร่วมทั้ง 2 โหมด) ──
function csvEscape(s: string): string {
  const str = String(s ?? "");
  const needsQuote = str.indexOf(",") >= 0 || str.indexOf('"') >= 0 || str.indexOf("\n") >= 0;
  if (!needsQuote) return str;
  return '"' + str.split('"').join('""') + '"';
}
function downloadCsv(content: string, filename: string) {
  // ใส่ BOM กันตัวอักษรไทยเพี้ยนตอนเปิดด้วย Excel
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── local component: Accordion หัวข้อมี checkbox "เลือกทั้งหมดในหมวดนี้" (indeterminate ได้) ──
// เขียนแยกจาก ui kit เพราะต้องมี element ที่คลิกแยกจากปุ่ม toggle เปิด/ปิด (กัน checkbox ซ้อนใน <button>)
function SelectableAccordion({
  title, total, selectedCount, defaultOpen, onToggleAll, children,
}: {
  title: string; total: number; selectedCount: number; defaultOpen?: boolean;
  onToggleAll: () => void; children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  const checkboxRef = React.useRef<HTMLInputElement>(null);
  const indeterminate = selectedCount > 0 && selectedCount < total;
  React.useEffect(() => {
    if (checkboxRef.current) checkboxRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <div className="glass-soft mb-2.5 overflow-hidden">
      <div className="flex w-full items-center gap-2 px-3.5 py-3">
        <input
          ref={checkboxRef}
          type="checkbox"
          checked={total > 0 && selectedCount === total}
          onChange={onToggleAll}
          className="h-4 w-4 flex-shrink-0 rounded border-black/20"
          aria-label={`เลือกทั้งหมดในหมวด ${title}`}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex flex-1 items-center justify-between gap-2 text-left text-[15px] font-medium"
        >
          <span>{title}</span>
          <span className="flex items-center gap-2 text-xs text-brand-ink/50">
            <span className="rounded-full bg-black/5 px-1.5 py-0.5 font-semibold text-brand-ink/60">
              {selectedCount}/{total}
            </span>
            <span className={`transition ${open ? "rotate-180" : ""}`}>▾</span>
          </span>
        </button>
      </div>
      {open && <div className="border-t border-black/5 px-2.5 py-1.5">{children}</div>}
    </div>
  );
}

export default function RestockPage() {
  const [mode, setMode] = React.useState<Mode>("byBranch");
  return (
    <div>
      <PageTitle title="เติมของ / สั่งผลิต" />

      <div className="mb-3">
        <Segmented options={MODE_OPTS} value={mode} onChange={setMode} />
      </div>

      {mode === "byBranch" ? <RestockByBranch /> : <ProductionOrder />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// โหมด A — ต้องเติมรายสาขา
// ══════════════════════════════════════════════════════════════════════
function RestockByBranch() {
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

  // เลือก/ไม่เลือก ต่อไอเทม + จำนวนสั่ง (แก้อิสระ ไม่ผูกกับ need อีกครั้งหลังผู้ใช้แก้แล้ว)
  const [selected, setSelected] = React.useState<Record<string, boolean>>({});
  const [qty, setQty] = React.useState<Record<string, string>>({});

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
        // รอบใหม่ (สาขา/วัน เปลี่ยน) → รีเซ็ตเลือก/จำนวนสั่งตาม need ที่ backend คำนวณมา
        const sel: Record<string, boolean> = {};
        const q: Record<string, string> = {};
        for (const r of data.rows) {
          sel[r.itemId] = r.need != null && r.need > 0;
          q[r.itemId] = String(r.need ?? 0);
        }
        setSelected(sel);
        setQty(q);
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
        setRows([]);
        setSpecialActive(false);
        setSelected({});
        setQty({});
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branch, day]);

  const dayLabel = DAY_LABEL[day];
  const ownSpecialDay = specialDayLabel(branch); // string | null — null = สาขานี้ยังไม่มีรอบ special

  // จัดกลุ่มตาม category (คงลำดับตามที่ backend ส่งมา)
  const groups = React.useMemo(() => {
    const out: { category: string; items: RestockRow[] }[] = [];
    for (const r of rows) {
      let g = out.find((x) => x.category === r.category);
      if (!g) { g = { category: r.category, items: [] }; out.push(g); }
      g.items.push(r);
    }
    return out;
  }, [rows]);

  const selectedTotal = React.useMemo(() => rows.filter((r) => selected[r.itemId]).length, [rows, selected]);

  function toggleItem(itemId: string) {
    setSelected((p) => ({ ...p, [itemId]: !p[itemId] }));
  }
  function toggleCategoryAll(items: RestockRow[]) {
    const allSel = items.length > 0 && items.every((r) => selected[r.itemId]);
    setSelected((p) => {
      const next = { ...p };
      for (const r of items) next[r.itemId] = !allSel;
      return next;
    });
  }
  function toggleAllGlobal() {
    const allSel = rows.length > 0 && rows.every((r) => selected[r.itemId]);
    setSelected((p) => {
      const next = { ...p };
      for (const r of rows) next[r.itemId] = !allSel;
      return next;
    });
  }

  function exportCsv() {
    const selectedRows = rows.filter((r) => selected[r.itemId]);
    const lines = ["หมวด,รายการ,Par,คงเหลือ,จำนวนสั่ง"];
    for (const r of selectedRows) {
      const q = qty[r.itemId] ?? "0";
      lines.push([csvEscape(r.category), csvEscape(r.name), r.par ?? "", r.remain, q].join(","));
    }
    downloadCsv(lines.join("\n"), `restock_${branch}_${day}_${todayISO()}.csv`);
  }

  const allChecked = rows.length > 0 && rows.every((r) => selected[r.itemId]);

  return (
    <div>
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
          <>
            {/* global toolbar */}
            <div className="mb-2.5 flex items-center justify-between gap-2 rounded-lg bg-black/[.03] px-3 py-2">
              <label className="flex items-center gap-2 text-xs font-medium text-brand-ink/70">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAllGlobal}
                  className="h-4 w-4 rounded border-black/20"
                />
                เลือกทั้งหมด
              </label>
              <span className="text-xs font-semibold text-brand-ink/60">
                {selectedTotal}/{rows.length} รายการที่เลือก
              </span>
            </div>

            {groups.map((g, gi) => {
              const selInCat = g.items.filter((r) => selected[r.itemId]).length;
              return (
                <SelectableAccordion
                  key={g.category}
                  title={g.category}
                  total={g.items.length}
                  selectedCount={selInCat}
                  defaultOpen={gi === 0}
                  onToggleAll={() => toggleCategoryAll(g.items)}
                >
                  <div className="overflow-hidden rounded-xl border border-black/5">
                    <div className="grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2.5 bg-black/5 px-3 py-2 text-[11px] font-medium text-brand-ink/50">
                      <span className="w-4" />
                      <span>รายการ</span>
                      <span className="w-10 text-right">Par</span>
                      <span className="w-12 text-right">คงเหลือ</span>
                      <span className="w-16 text-right">จำนวนสั่ง</span>
                    </div>
                    {g.items.map((r, i) => {
                      const isSel = !!selected[r.itemId];
                      return (
                        <div
                          key={r.itemId}
                          className={`grid grid-cols-[auto_1fr_auto_auto_auto] items-center gap-2.5 px-3 py-2.5 text-sm ${
                            i % 2 ? "bg-white/30" : "bg-white/50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleItem(r.itemId)}
                            className="h-4 w-4 rounded border-black/20"
                          />
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate">{r.name}</span>
                            {r.isSpecial && <Badge tone="orange">special</Badge>}
                          </span>
                          <span className="w-10 text-right tabular-nums text-brand-ink/70">{r.par ?? "—"}</span>
                          <span className="w-12 text-right tabular-nums text-brand-ink/70">{r.remain}</span>
                          <input
                            inputMode="numeric"
                            value={qty[r.itemId] ?? ""}
                            disabled={!isSel}
                            onChange={(e) => setQty((p) => ({ ...p, [r.itemId]: e.target.value }))}
                            className={`field w-16 px-1.5 py-1 text-right text-xs ${
                              isSel ? "font-semibold" : "opacity-40"
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                </SelectableAccordion>
              );
            })}
          </>
        )}

        {!loading && !error && rows.length > 0 && (
          <p className="mt-3 text-xs leading-relaxed text-brand-ink/60">
            {specialActive
              ? `รอบนี้รวม 7 รายการ special (${branch} เข้า${dayLabel})`
              : ownSpecialDay
                ? `รอบนี้ไม่มี 7 รายการ special — ${branch} รับ special เฉพาะวัน${ownSpecialDay}`
                : `สาขา ${branch} ยังไม่เปิดรับ 7 รายการ special (รอกำหนดรอบเติมของ)`}
          </p>
        )}
      </GlassCard>

      {!loading && !error && rows.length > 0 && (
        <button
          type="button"
          onClick={exportCsv}
          className="mt-3 w-full rounded-xl bg-white/70 px-4 py-3 text-[15px] font-semibold text-brand-ink border border-black/10 active:scale-[.98]"
        >
          📤 Export รายการ (CSV)
        </button>
      )}

      <p className="mt-3 px-1 text-xs text-brand-ink/45">ต้องเติม = MAX(Par − คงเหลือ, 0)</p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// โหมด B — สั่งผลิต (รวมทุกสาขา) — ไม่มี backend ใหม่ ใช้ /api/meta อย่างเดียว ไม่มีปุ่มบันทึก มีแต่ export
// ══════════════════════════════════════════════════════════════════════
type ProdField = "SND" | "NVP" | "KCN" | "other";
const PROD_FIELDS: { key: ProdField; label: string }[] = [
  { key: "SND", label: "SND" },
  { key: "NVP", label: "NVP" },
  { key: "KCN", label: "KCN" },
  { key: "other", label: "อื่นๆ" },
];

interface ExtraRow { id: string; name: string; qty: string }

function ProductionRow({
  item, par, values, onChange, tone, isNew,
}: {
  item: Item;
  par: Partial<Record<Branch, number | null>>;
  values: Partial<Record<ProdField, string>>;
  onChange: (field: ProdField, v: string) => void;
  tone?: "orange";
  isNew?: boolean;
}) {
  const total = PROD_FIELDS.reduce((s, f) => s + (parseFloat(values[f.key] ?? "") || 0), 0);
  const isOrange = tone === "orange";
  return (
    <div className={`px-3 py-2.5 ${isOrange ? "rounded-xl border border-brand-orange/40 bg-brand-orange/10" : "glass-soft"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`text-sm font-medium ${isOrange ? "text-orange-700" : ""}`}>{item.name}</span>
        {isNew && <Badge tone="ok">ไอเทมใหม่</Badge>}
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {PROD_FIELDS.map((f) => {
          const parVal = f.key === "other" ? undefined : par[f.key as Branch];
          const disabled = f.key !== "other" && parVal == null;
          return (
            <label key={f.key} className="flex flex-col gap-0.5">
              <span className={`text-[8.5px] leading-tight ${isOrange ? "text-orange-700/70" : "text-brand-ink/50"}`}>
                {f.label}
              </span>
              {f.key !== "other" && (
                <span className={`text-[7.5px] leading-none ${isOrange ? "text-orange-700/50" : "text-brand-ink/35"}`}>
                  Par {parVal ?? "—"}
                </span>
              )}
              <input
                inputMode="numeric"
                value={values[f.key] ?? ""}
                disabled={disabled}
                onChange={(e) => onChange(f.key, e.target.value)}
                className={`field px-1.5 py-1 text-center text-xs ${disabled ? "opacity-40" : ""} ${
                  isOrange ? "bg-white/80" : ""
                }`}
              />
            </label>
          );
        })}
      </div>
      <div className={`mt-2 text-right text-xs font-semibold ${isOrange ? "text-orange-700" : "text-brand-ink/70"}`}>
        รวมสั่งผลิต: {total}
      </div>
    </div>
  );
}

function ProductionOrder() {
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/meta")
      .then((r) => r.json())
      .then((m: Meta) => { if (alive) setMeta(m); })
      .catch((e) => { if (alive) setError(String(e?.message ?? e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const [prodQty, setProdQty] = React.useState<Record<string, Partial<Record<ProdField, string>>>>({});
  const [extraRows, setExtraRows] = React.useState<ExtraRow[]>([]);
  const [extraName, setExtraName] = React.useState("");
  const [note, setNote] = React.useState("");

  function setProd(itemId: string, field: ProdField, value: string) {
    setProdQty((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  }
  function prodTotal(itemId: string): number {
    const v = prodQty[itemId] ?? {};
    return PROD_FIELDS.reduce((s, f) => s + (parseFloat(v[f.key] ?? "") || 0), 0);
  }

  function addExtraRow() {
    const name = extraName.trim();
    if (!name) return;
    setExtraRows((prev) => [...prev, { id: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, qty: "" }]);
    setExtraName("");
  }
  function removeExtraRow(id: string) {
    setExtraRows((prev) => prev.filter((r) => r.id !== id));
  }
  function setExtraQty(id: string, qty: string) {
    setExtraRows((prev) => prev.map((r) => (r.id === id ? { ...r, qty } : r)));
  }

  const mainGroups = React.useMemo(() => {
    if (!meta) return [] as { category: string; items: Item[] }[];
    const shown = meta.items
      .filter((it) => PRODUCTION_ITEMS_MAIN.includes(it.name))
      .sort((a, b) => a.sort - b.sort);
    const out: { category: string; items: Item[] }[] = [];
    for (const it of shown) {
      let g = out.find((x) => x.category === it.category);
      if (!g) { g = { category: it.category, items: [] }; out.push(g); }
      g.items.push(it);
    }
    return out;
  }, [meta]);

  const dept2Items = React.useMemo(() => {
    if (!meta) return [] as Item[];
    return meta.items
      .filter((it) => PRODUCTION_ITEMS_DEPT2.includes(it.name))
      .sort((a, b) => a.sort - b.sort);
  }, [meta]);

  function exportCsv() {
    const lines = ["หมวด,รายการ,SND,NVP,KCN,อื่นๆ,รวมสั่งผลิต"];
    for (const g of mainGroups) {
      for (const it of g.items) {
        const v = prodQty[it.id] ?? {};
        lines.push([
          csvEscape(g.category), csvEscape(it.name),
          v.SND ?? "", v.NVP ?? "", v.KCN ?? "", v.other ?? "",
          prodTotal(it.id),
        ].join(","));
      }
    }
    for (const it of dept2Items) {
      const v = prodQty[it.id] ?? {};
      lines.push([
        csvEscape("แผนกอื่น"), csvEscape(it.name),
        v.SND ?? "", v.NVP ?? "", v.KCN ?? "", v.other ?? "",
        prodTotal(it.id),
      ].join(","));
    }
    for (const r of extraRows) {
      lines.push([csvEscape("รายการพิเศษ (ครั้งเดียว)"), csvEscape(r.name), "", "", "", "", r.qty || "0"].join(","));
    }
    if (note.trim()) {
      lines.push("");
      lines.push(`หมายเหตุ,${csvEscape(note.trim())}`);
    }
    downloadCsv(lines.join("\n"), `production_order_${todayISO()}.csv`);
  }

  if (loading) {
    return <GlassCard><p className="text-sm text-brand-ink/50">กำลังโหลด…</p></GlassCard>;
  }
  if (error) {
    return <GlassCard><p className="text-sm text-warn">โหลดข้อมูลไม่สำเร็จ: {error}</p></GlassCard>;
  }

  return (
    <div>
      {mainGroups.map((g, gi) => (
        <Accordion key={g.category} title={g.category} count={`${g.items.length} รายการ`} defaultOpen={gi === 0}>
          <div className="grid gap-2 py-1">
            {g.items.map((it) => (
              <ProductionRow
                key={it.id}
                item={it}
                par={meta?.par[it.id] ?? {}}
                values={prodQty[it.id] ?? {}}
                onChange={(f, v) => setProd(it.id, f, v)}
              />
            ))}
          </div>
        </Accordion>
      ))}

      <p className="my-3 text-center text-xs text-brand-ink/40">
        ── 🍪 แผนกอื่น (แยกจากไลน์ผลิตหลัก — ใส่ชื่อแผนกจริงแทนได้) ──
      </p>

      <Accordion title="🍪 แผนกอื่น" count={`${dept2Items.length} รายการ`} defaultOpen={false}>
        <div className="grid gap-2 py-1">
          {dept2Items.map((it) => (
            <ProductionRow
              key={it.id}
              item={it}
              par={meta?.par[it.id] ?? {}}
              values={prodQty[it.id] ?? {}}
              onChange={(f, v) => setProd(it.id, f, v)}
              tone="orange"
              isNew={NEW_ITEM_NAMES.includes(it.name)}
            />
          ))}
        </div>
      </Accordion>

      <GlassCard className="mt-3">
        <h3 className="mb-2.5 text-[15px] font-semibold">➕ เพิ่มรายการสั่งผลิตพิเศษ</h3>
        <div className="mb-3 flex gap-2">
          <input
            value={extraName}
            onChange={(e) => setExtraName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addExtraRow(); }}
            placeholder="ชื่อรายการ"
            className="field flex-1"
          />
          <button
            type="button"
            onClick={addExtraRow}
            className="shrink-0 rounded-xl bg-brand-ink px-4 py-2.5 text-sm font-semibold text-white active:scale-[.98]"
          >
            เพิ่ม
          </button>
        </div>
        {extraRows.length > 0 && (
          <div className="grid gap-2">
            {extraRows.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg bg-black/[.03] px-2.5 py-2">
                <span className="flex-1 truncate text-sm">{r.name}</span>
                <input
                  inputMode="numeric"
                  value={r.qty}
                  onChange={(e) => setExtraQty(r.id, e.target.value)}
                  placeholder="จำนวน"
                  className="field w-20 px-1.5 py-1 text-right text-xs"
                />
                <button
                  type="button"
                  onClick={() => removeExtraRow(r.id)}
                  className="shrink-0 text-brand-ink/40"
                  aria-label={`ลบ ${r.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard className="mt-3">
        <h3 className="mb-2 text-[15px] font-semibold">📝 หมายเหตุ</h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
          placeholder="พิมพ์หมายเหตุ (ถ้ามี)"
          className="field w-full resize-none"
        />
      </GlassCard>

      <button
        type="button"
        onClick={exportCsv}
        className="mt-3 w-full rounded-xl bg-white/70 px-4 py-3 text-[15px] font-semibold text-brand-ink border border-black/10 active:scale-[.98]"
      >
        📤 Export ใบสั่งผลิต (CSV)
      </button>
    </div>
  );
}
