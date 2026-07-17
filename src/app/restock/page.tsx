"use client";
// M2 · Restock — 2 โหมดสลับด้วย toggle บนสุด
//  A) "ต้องเติมรายสาขา": date picker จริงแทนปุ่มพุธ/เสาร์เดิม + จัดกลุ่มตาม category + เลือกรายการ (compact)
//     + จำนวนสั่งแก้ได้อิสระ + export CSV — การเลือกของแต่ละ (สาขา,วันที่) จำไว้ข้ามการสลับหน้าจอ
//  B) "สั่งผลิต (รวมทุกสาขา)": ดึงค่าที่เลือกไว้ในโหมด A มา pre-fill อัตโนมัติ (ยังแก้เองได้อิสระ)
//     + 2 วันที่ (สั่งผลิต/จัดส่ง) + รายการพิเศษ (ชื่อ/จำนวน/หน่วย/หมายเหตุ) + export CSV
// business logic เดิม (fetch /api/restock, specialActive, specialDayLabel, isSpecialActive) คงไว้เป๊ะ
import React from "react";
import { GlassCard, Segmented, BranchPicker, Badge, PageTitle, Accordion } from "@/components/ui";
import { useMe } from "@/components/nav";
import type { Branch, Weekday, RestockRow, Meta, Item } from "@/lib/types";
import { specialDayLabel, weekdayFromDate, isSpecialActive } from "@/lib/calc";
import { todayISO } from "@/lib/fmt";

const WEEKDAY_LABEL_TH: Record<Weekday, string> = {
  sun: "อาทิตย์", mon: "จันทร์", tue: "อังคาร", wed: "พุธ", thu: "พฤหัสบดี", fri: "ศุกร์", sat: "เสาร์",
};

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
const PRODUCTION_ITEM_NAMES = new Set([...PRODUCTION_ITEMS_MAIN, ...PRODUCTION_ITEMS_DEPT2]);
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

// ── state ที่ "ต้องเติมรายสาขา" เลือกไว้ (ยกขึ้นมาที่ RestockPage เพื่อให้ข้อ 3 อ่านข้ามโหมดได้) ──
// key = `${branch}|${date}` — คนละ (สาขา,วันที่) = คนละชุดข้อมูล ไม่ทับกัน
interface RestockEntry { selected: boolean; qty: string; ts: number }
type RestockStore = Record<string, Record<string, RestockEntry>>;
const storeKey = (branch: Branch, date: string) => `${branch}|${date}`;

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
    <div className="glass-soft mb-2 overflow-hidden">
      <div className="flex w-full items-center gap-2 px-3 py-2">
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
          className="flex flex-1 items-center justify-between gap-2 text-left text-[14px] font-medium"
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
      {open && <div className="border-t border-black/5 px-1.5 py-1">{children}</div>}
    </div>
  );
}

export default function RestockPage() {
  const [mode, setMode] = React.useState<Mode>("byBranch");
  const [store, setStore] = React.useState<RestockStore>({});
  return (
    <div>
      <PageTitle title="เติมของ / สั่งผลิต" />

      <div className="mb-3">
        <Segmented options={MODE_OPTS} value={mode} onChange={setMode} />
      </div>

      {mode === "byBranch" ? (
        <RestockByBranch store={store} setStore={setStore} />
      ) : (
        <ProductionOrder store={store} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// โหมด A — ต้องเติมรายสาขา
// ══════════════════════════════════════════════════════════════════════
function RestockByBranch({
  store, setStore,
}: {
  store: RestockStore;
  setStore: React.Dispatch<React.SetStateAction<RestockStore>>;
}) {
  const me = useMe();
  const scoped = !!me && me.branchScope !== "all";
  const [branch, setBranch] = React.useState<Branch>("NVP");
  const [date, setDate] = React.useState<string>(todayISO());

  React.useEffect(() => {
    if (scoped) setBranch(me!.branchScope as Branch);
  }, [scoped, me]);

  const [rows, setRows] = React.useState<RestockRow[]>([]);
  const [specialActive, setSpecialActive] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const weekday = React.useMemo(() => weekdayFromDate(date), [date]);
  const key = React.useMemo(() => storeKey(branch, date), [branch, date]);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    fetch(`/api/restock?branch=${branch}&day=${weekday}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error ?? "โหลดข้อมูลไม่สำเร็จ");
        return data as { rows: RestockRow[]; specialActive: boolean };
      })
      .then((data) => {
        if (!alive) return;
        setRows(data.rows);
        setSpecialActive(data.specialActive);
        // ถ้า (สาขา,วันที่) นี้ยังไม่เคยมีข้อมูลใน store ให้ตั้งค่าเริ่มต้นจาก need — ถ้ามีอยู่แล้ว (เคยเลือก/แก้ไว้) ไม่เขียนทับ
        setStore((prev) => {
          if (prev[key]) return prev;
          const entries: Record<string, RestockEntry> = {};
          const now = Date.now();
          for (const r of data.rows) {
            entries[r.itemId] = { selected: r.need != null && r.need > 0, qty: String(r.need ?? 0), ts: now };
          }
          return { ...prev, [key]: entries };
        });
      })
      .catch((e) => {
        if (!alive) return;
        setError(e?.message ?? "โหลดข้อมูลไม่สำเร็จ");
        setRows([]);
        setSpecialActive(false);
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [branch, weekday, key, setStore]);

  const dayLabel = "วัน" + WEEKDAY_LABEL_TH[weekday];
  const ownSpecialDay = specialDayLabel(branch); // string | null — null = สาขานี้ยังไม่มีรอบ special

  const entries = store[key] ?? {};

  function updateEntry(itemId: string, patch: Partial<RestockEntry>) {
    setStore((prev) => {
      const cur = prev[key]?.[itemId] ?? { selected: false, qty: "0", ts: 0 };
      return {
        ...prev,
        [key]: { ...prev[key], [itemId]: { ...cur, ...patch, ts: Date.now() } },
      };
    });
  }
  function toggleItem(itemId: string) {
    updateEntry(itemId, { selected: !entries[itemId]?.selected });
  }
  function toggleCategoryAll(items: RestockRow[]) {
    const allSel = items.length > 0 && items.every((r) => entries[r.itemId]?.selected);
    setStore((prev) => {
      const next = { ...(prev[key] ?? {}) };
      const now = Date.now();
      for (const r of items) {
        const cur = next[r.itemId] ?? { selected: false, qty: "0", ts: now };
        next[r.itemId] = { ...cur, selected: !allSel, ts: now };
      }
      return { ...prev, [key]: next };
    });
  }
  function toggleAllGlobal() {
    toggleCategoryAll(rows);
  }

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

  const selectedTotal = React.useMemo(
    () => rows.filter((r) => entries[r.itemId]?.selected).length,
    [rows, entries]
  );
  const allChecked = rows.length > 0 && rows.every((r) => entries[r.itemId]?.selected);

  function exportCsv() {
    const selectedRows = rows.filter((r) => entries[r.itemId]?.selected);
    const lines = ["หมวด,รายการ,จำนวนสั่ง"];
    for (const r of selectedRows) {
      const q = entries[r.itemId]?.qty ?? "0";
      lines.push([csvEscape(r.category), csvEscape(r.name), q].join(","));
    }
    downloadCsv(lines.join("\n"), `restock_${branch}_${date}.csv`);
  }

  return (
    <div>
      <div className="mb-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <BranchPicker value={branch} onChange={setBranch} locked={scoped} />
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-brand-ink/50">วันที่จัดส่งสินค้าเข้าสาขา</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayISO())} className="field" />
        </label>
      </div>
      <p className="mb-3 px-1 text-[11px] text-brand-ink/50">
        ตรงกับ{dayLabel}
        {isSpecialActive(branch, weekday) ? " — มีรอบ special ที่สาขานี้" : " — ไม่มีรอบ special วันนี้"}
      </p>

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
              const selInCat = g.items.filter((r) => entries[r.itemId]?.selected).length;
              return (
                <SelectableAccordion
                  key={g.category}
                  title={g.category}
                  total={g.items.length}
                  selectedCount={selInCat}
                  defaultOpen={gi === 0}
                  onToggleAll={() => toggleCategoryAll(g.items)}
                >
                  <div>
                    {g.items.map((r) => {
                      const entry = entries[r.itemId];
                      const isSel = !!entry?.selected;
                      const inProduction = PRODUCTION_ITEM_NAMES.has(r.name);
                      return (
                        <div
                          key={r.itemId}
                          className={`mb-0.5 flex min-h-[26px] items-center gap-1.5 rounded-md border-l-[2.5px] px-1.5 py-1 ${
                            isSel
                              ? "border-l-ok bg-ok/10"
                              : "border-l-transparent bg-black/[.02] opacity-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={() => toggleItem(r.itemId)}
                            className="h-3.5 w-3.5 flex-shrink-0 rounded border-black/20"
                          />
                          <span className="flex min-w-0 flex-1 items-center gap-1 text-[11.5px] font-medium">
                            <span className="truncate">{r.name}</span>
                            {r.isSpecial && <Badge tone="orange">special</Badge>}
                            {inProduction && <Badge tone="blue">← สั่งผลิต</Badge>}
                          </span>
                          <span className="w-8 shrink-0 text-right text-[10.5px] tabular-nums text-brand-ink/60">
                            {r.par ?? "—"}
                          </span>
                          <span className="w-8 shrink-0 text-right text-[10.5px] tabular-nums text-brand-ink/60">
                            {r.remain}
                          </span>
                          <input
                            inputMode="numeric"
                            value={entry?.qty ?? ""}
                            disabled={!isSel}
                            onChange={(e) => updateEntry(r.itemId, { qty: e.target.value })}
                            className={`field w-[34px] shrink-0 px-1 py-0.5 text-center text-[11px] ${
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

      <p className="mt-3 px-1 text-xs text-brand-ink/45">ต้องเติม = MAX(Par − คงเหลือ, 0) · แถบฟ้า "← สั่งผลิต" = ไอเทมนี้จะไปโผล่ในหน้าสั่งผลิตอัตโนมัติ</p>
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

interface ExtraRow { id: string; name: string; qty: string; unit: string; note: string }

function ProductionRow({
  item, par, values, onChange, tone, isNew, reflected,
}: {
  item: Item;
  par: Partial<Record<Branch, number | null>>;
  values: Partial<Record<ProdField, string>>;
  onChange: (field: ProdField, v: string) => void;
  tone?: "orange";
  isNew?: boolean;
  reflected?: boolean;
}) {
  const total = PROD_FIELDS.reduce((s, f) => s + (parseFloat(values[f.key] ?? "") || 0), 0);
  const isOrange = tone === "orange";
  return (
    <div className={`px-3 py-2.5 ${isOrange ? "rounded-xl border border-brand-orange/40 bg-brand-orange/10" : "glass-soft"}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className={`text-sm font-medium ${isOrange ? "text-orange-700" : ""}`}>{item.name}</span>
        <div className="flex shrink-0 gap-1">
          {reflected && <Badge tone="blue">จาก Restock</Badge>}
          {isNew && <Badge tone="ok">ไอเทมใหม่</Badge>}
        </div>
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

function ProductionOrder({ store }: { store: RestockStore }) {
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
  const [orderDate, setOrderDate] = React.useState<string>(todayISO());
  const [deliveryDate, setDeliveryDate] = React.useState<string>(todayISO());

  function setProd(itemId: string, field: ProdField, value: string) {
    setProdQty((prev) => ({ ...prev, [itemId]: { ...prev[itemId], [field]: value } }));
  }

  function addExtraRow() {
    const name = extraName.trim();
    if (!name) return;
    setExtraRows((prev) => [
      ...prev,
      { id: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name, qty: "", unit: "", note: "" },
    ]);
    setExtraName("");
  }
  function removeExtraRow(id: string) {
    setExtraRows((prev) => prev.filter((r) => r.id !== id));
  }
  function patchExtraRow(id: string, patch: Partial<ExtraRow>) {
    setExtraRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
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

  // ── ข้อ 3: ดึงค่าที่เลือกไว้ใน "ต้องเติมรายสาขา" มา pre-fill (ค่าล่าสุดต่อ item+branch ตาม timestamp) ──
  const reflected = React.useMemo(() => {
    const out: Record<string, Partial<Record<Branch, string>>> = {};
    const latestTs: Record<string, number> = {};
    for (const key in store) {
      const branch = key.split("|")[0] as Branch;
      const entries = store[key];
      for (const itemId in entries) {
        const entry = entries[itemId];
        if (!entry.selected) continue;
        const trackKey = itemId + "|" + branch;
        if (latestTs[trackKey] === undefined || entry.ts > latestTs[trackKey]) {
          latestTs[trackKey] = entry.ts;
          if (!out[itemId]) out[itemId] = {};
          out[itemId][branch] = entry.qty;
        }
      }
    }
    return out;
  }, [store]);

  function valuesFor(itemId: string): Partial<Record<ProdField, string>> {
    return { ...reflected[itemId], ...prodQty[itemId] };
  }
  function totalFor(itemId: string): number {
    const v = valuesFor(itemId);
    return PROD_FIELDS.reduce((s, f) => s + (parseFloat(v[f.key] ?? "") || 0), 0);
  }
  function isReflected(itemId: string): boolean {
    return !!reflected[itemId] && Object.keys(reflected[itemId]).length > 0;
  }

  function exportCsv() {
    const lines = [
      `วันที่สั่งผลิต,${orderDate}`,
      `วันที่จัดส่งเข้าสาขา,${deliveryDate}`,
      "",
      "หมวด,รายการ,SND,NVP,KCN,อื่นๆ,รวมสั่งผลิต",
    ];
    for (const g of mainGroups) {
      for (const it of g.items) {
        const v = valuesFor(it.id);
        lines.push([
          csvEscape(g.category), csvEscape(it.name),
          v.SND ?? "", v.NVP ?? "", v.KCN ?? "", v.other ?? "",
          totalFor(it.id),
        ].join(","));
      }
    }
    for (const it of dept2Items) {
      const v = valuesFor(it.id);
      lines.push([
        csvEscape("แผนกอื่น"), csvEscape(it.name),
        v.SND ?? "", v.NVP ?? "", v.KCN ?? "", v.other ?? "",
        totalFor(it.id),
      ].join(","));
    }
    for (const r of extraRows) {
      lines.push([
        csvEscape("รายการพิเศษ (ครั้งเดียว)"), csvEscape(r.name),
        "", "", "", csvEscape(r.qty || "0") + (r.unit ? " " + csvEscape(r.unit) : ""),
        r.qty || "0",
      ].join(","));
      if (r.note.trim()) lines.push(",หมายเหตุ: " + csvEscape(r.note.trim()) + ",,,,,");
    }
    if (note.trim()) {
      lines.push("");
      lines.push(`หมายเหตุรวม,${csvEscape(note.trim())}`);
    }
    downloadCsv(lines.join("\n"), `production_order_${orderDate}.csv`);
  }

  if (loading) {
    return <GlassCard><p className="text-sm text-brand-ink/50">กำลังโหลด…</p></GlassCard>;
  }
  if (error) {
    return <GlassCard><p className="text-sm text-warn">โหลดข้อมูลไม่สำเร็จ: {error}</p></GlassCard>;
  }

  return (
    <div>
      <GlassCard className="mb-3">
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">วันที่สั่งผลิต</span>
            <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value || todayISO())} className="field" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">วันที่จัดส่งเข้าสาขา</span>
            <input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value || todayISO())} className="field" />
          </label>
        </div>
      </GlassCard>

      {mainGroups.map((g, gi) => (
        <Accordion key={g.category} title={g.category} count={`${g.items.length} รายการ`} defaultOpen={gi === 0}>
          <div className="grid gap-2 py-1">
            {g.items.map((it) => (
              <ProductionRow
                key={it.id}
                item={it}
                par={meta?.par[it.id] ?? {}}
                values={valuesFor(it.id)}
                onChange={(f, v) => setProd(it.id, f, v)}
                reflected={isReflected(it.id)}
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
              values={valuesFor(it.id)}
              onChange={(f, v) => setProd(it.id, f, v)}
              tone="orange"
              isNew={NEW_ITEM_NAMES.includes(it.name)}
              reflected={isReflected(it.id)}
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
              <div key={r.id} className="rounded-lg bg-black/[.03] px-2.5 py-2">
                <div className="flex items-center gap-2">
                  <span className="flex-1 truncate text-sm font-medium">{r.name}</span>
                  <input
                    inputMode="numeric"
                    value={r.qty}
                    onChange={(e) => patchExtraRow(r.id, { qty: e.target.value })}
                    placeholder="จำนวน"
                    className="field w-16 px-1.5 py-1 text-right text-xs"
                  />
                  <input
                    value={r.unit}
                    onChange={(e) => patchExtraRow(r.id, { unit: e.target.value })}
                    placeholder="หน่วย"
                    className="field w-16 px-1.5 py-1 text-center text-xs"
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
                <input
                  value={r.note}
                  onChange={(e) => patchExtraRow(r.id, { note: e.target.value })}
                  placeholder="หมายเหตุ (ถ้ามี)"
                  className="field mt-1.5 w-full px-2 py-1 text-left text-xs"
                />
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
