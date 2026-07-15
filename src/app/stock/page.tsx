"use client";
// M1: Stock Entry — กรอกสต็อกรายวัน/สาขา (glass, mobile-first)
// hasRemainder items = UOM (แพ็ค) + Sale Unit (เศษ g). 1 แพ็ค = item.gramsPerUOM กรัม (ตั้งหน้า Settings)
// เศษคงเหลือเกินเมื่อวานได้ (แกะกล่องใหม่) แต่ยอดรวม (แพ็ค×N + เศษ) วันนี้ ต้องไม่เกิน ของที่มี (ยกมา+รับเข้า)
import React from "react";
import type { Branch, Item, Meta, StockRow } from "@/lib/types";
import { remainPieces, variance } from "@/lib/calc";
import { todayISO, thaiDate } from "@/lib/fmt";
import {
  GlassCard, Badge, Button, Segmented, Accordion, NumberField, Stat, SaveBar, PageTitle,
} from "@/components/ui";

const BRANCH_OPTS: { value: Branch; label: string }[] = [
  { value: "SND", label: "สาขา SND" },
  { value: "NVP", label: "สาขา NVP" },
];

const toNum = (raw: string): number => {
  const x = parseFloat(raw);
  return Number.isFinite(x) ? x : 0;
};
const blankZero = (v: number): number | string => (v === 0 ? "" : v);

// ยอดรวมเป็นกรัม (UOM×N + เศษ) — ใช้เช็คว่าคงเหลือวันนี้ไม่เกินของที่มี
function derive(r: StockRow, N: number) {
  const availTotalG = (r.carryPack + r.inPack) * N + r.carryG + r.inG;
  const remainTotalG = r.remainPack * N + r.remainG;
  const usedTotalG = availTotalG - remainTotalG; // กรัมที่ขาย/ใช้จริงรวม
  return { availTotalG, remainTotalG, usedTotalG, overG: usedTotalG < 0 ? -usedTotalG : 0 };
}

const varianceOf = (r: StockRow): number =>
  variance(r.carryPack, r.inPack, r.used, r.returned, r.remainPack);

const isFilled = (r: StockRow): boolean =>
  r.inPack > 0 || r.inG > 0 || r.remainPack !== r.carryPack || r.remainG !== r.carryG;

export default function StockPage() {
  const [branch, setBranch] = React.useState<Branch>("NVP");
  const [date, setDate] = React.useState<string>(todayISO());
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [rows, setRows] = React.useState<Record<string, StockRow>>({});
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);

  React.useEffect(() => {
    let alive = true;
    fetch("/api/meta")
      .then((r) => r.json())
      .then((m: Meta) => { if (alive) setMeta(m); })
      .catch((e) => { if (alive) setErr(String(e?.message ?? e)); });
    return () => { alive = false; };
  }, []);

  React.useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    fetch(`/api/stock?branch=${branch}&date=${date}`)
      .then((r) => r.json())
      .then((data: { rows?: StockRow[]; error?: string }) => {
        if (!alive) return;
        if (data.error) { setErr(data.error); return; }
        const map: Record<string, StockRow> = {};
        for (const row of data.rows ?? []) map[row.itemId] = row;
        setRows(map);
      })
      .catch((e) => { if (alive) setErr(String(e?.message ?? e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [branch, date]);

  const groups = React.useMemo(() => {
    if (!meta) return [] as { category: string; items: Item[] }[];
    const shown = meta.items
      // แสดงรายการที่ stock ในสาขานี้ + ทุกสมาชิกกลุ่มเศษรวม (ให้นับกล่องได้ทุกขนาด)
      .filter((it) => meta.par[it.id]?.[branch] != null || it.remainderGroup)
      .sort((a, b) => a.sort - b.sort);
    const out: { category: string; items: Item[] }[] = [];
    for (const it of shown) {
      let g = out.find((x) => x.category === it.category);
      if (!g) { g = { category: it.category, items: [] }; out.push(g); }
      g.items.push(it);
    }
    return out;
  }, [meta, branch]);

  const shownItems = React.useMemo(() => groups.flatMap((g) => g.items), [groups]);
  const total = shownItems.length;

  const itemById = React.useMemo(
    () => new Map((meta?.items ?? []).map((it) => [it.id, it] as const)),
    [meta],
  );
  // กลุ่มเศษรวม → รายชื่อ item id (เรียงตาม sort) ที่ stock ในสาขานี้
  const groupIds = React.useMemo(() => {
    const m = new Map<string, string[]>();
    if (!meta) return m;
    const gs = meta.items
      .filter((it) => it.remainderGroup) // ทุกสมาชิกกลุ่ม (ไม่ว่า par จะมีหรือไม่)
      .sort((a, b) => a.sort - b.sort);
    for (const it of gs) {
      const g = it.remainderGroup!;
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(it.id);
    }
    return m;
  }, [meta, branch]);

  // ยอดรวมของกลุ่ม (กรัม): Σ(คงเหลือกล่อง×ขนาด) + เศษรวม(ที่ leader) ≤ ของที่มี
  const groupTotals = React.useCallback((groupName: string) => {
    const ids = groupIds.get(groupName) ?? [];
    const leaderId = ids[0];
    let availG = 0, remainG = 0;
    for (const id of ids) {
      const it = itemById.get(id); const r = rows[id];
      if (!it || !r) continue;
      availG += (r.carryPack + r.inPack) * it.gramsPerUOM;
      remainG += r.remainPack * it.gramsPerUOM;
    }
    const lr = rows[leaderId];
    if (lr) { availG += lr.carryG + lr.inG; remainG += lr.remainG; }
    const usedG = availG - remainG;
    return { leaderId, availG, remainG, usedG, overG: usedG < 0 ? -usedG : 0 };
  }, [groupIds, itemById, rows]);

  // นับ กรอกแล้ว + รายการที่เกิน (คงเหลือรวมเกินของที่มี / variance / กลุ่มเกิน)
  const { filledCount, errorCount } = React.useMemo(() => {
    let filled = 0, error = 0;
    for (const it of shownItems) {
      const r = rows[it.id];
      if (!r) continue;
      if (isFilled(r)) filled++;
      if (it.remainderGroup) continue; // กลุ่มเช็คแยกด้านล่าง
      const bad = it.hasRemainder
        ? derive(r, it.gramsPerUOM).usedTotalG < 0
        : varianceOf(r) !== 0;
      if (bad) error++;
    }
    for (const [g] of groupIds) if (groupTotals(g).overG > 0) error++;
    return { filledCount: filled, errorCount: error };
  }, [shownItems, rows, groupIds, groupTotals]);

  type NumField = "inPack" | "used" | "remainPack" | "returned" | "inG" | "usedG" | "remainG";
  // คงเหลือแพ็ค = ยกมา + รับเข้า − ออก/ขาย − ส่งคืน/เสีย (ส่งคืนหักจากยอด stock)
  const calcRemainPack = (r: StockRow) => Math.max(r.carryPack + r.inPack - r.used - r.returned, 0);
  function setField(itemId: string, field: NumField, raw: string, N: number) {
    setRows((prev) => {
      const cur = prev[itemId];
      if (!cur) return prev;
      const val = toNum(raw);
      const next: StockRow = { ...cur };
      switch (field) {
        case "inPack": // รับเข้า (แพ็ค) → คงเหลือแพ็ค ปรับตาม
          next.inPack = val;
          next.remainPack = calcRemainPack(next);
          break;
        case "used": // ออก/ขาย (แพ็ค) → คำนวณคงเหลือแพ็ค
          next.used = val;
          next.remainPack = calcRemainPack(next);
          break;
        case "returned": // ส่งคืน/เสีย (แพ็ค) → หักจากคงเหลือ
          next.returned = val;
          next.remainPack = calcRemainPack(next);
          break;
        case "remainPack": // คงเหลือแพ็ค → คำนวณ ออก/ขาย ย้อนกลับ (คงค่าส่งคืน)
          next.remainPack = val;
          next.used = Math.max(next.carryPack + next.inPack - next.returned - val, 0);
          break;
        case "inG": // รับเข้า g (เศษ) → คงเหลือ g เพิ่มตาม
          next.remainG = Math.max(next.remainG + (val - next.inG), 0);
          next.inG = val;
          break;
        case "usedG": { // ขาย/ใช้ g รวม → คำนวณคงเหลือ g (รวมกล่องที่แกะ)
          const openedG = Math.max(next.carryPack + next.inPack - next.remainPack, 0) * N;
          const availForSale = next.carryG + next.inG + openedG;
          next.remainG = Math.max(availForSale - val, 0);
          break;
        }
        case "remainG": // คงเหลือ g (เศษ) → กรอกอิสระ (เกิน carryG ได้ = แกะกล่องใหม่)
          next.remainG = val;
          break;
      }
      next.variance = varianceOf(next);
      return { ...prev, [itemId]: next };
    });
  }

  function setNote(itemId: string, note: string) {
    setRows((prev) => {
      const cur = prev[itemId];
      if (!cur) return prev;
      return { ...prev, [itemId]: { ...cur, note } };
    });
  }

  async function handleSave() {
    if (errorCount > 0) {
      const ok = window.confirm(`มี ${errorCount} รายการที่คงเหลือรวมเกินของที่มี\nต้องการบันทึกเลยไหม?`);
      if (!ok) return;
    }
    setSaving(true);
    try {
      const payload = shownItems
        .map((it) => rows[it.id])
        .filter(Boolean)
        .map((r) => ({ ...r, variance: varianceOf(r) }));
      const res = await fetch("/api/stock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branch, date, rows: payload }),
      });
      const data = (await res.json()) as { updated?: number; inserted?: number; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      window.alert(`บันทึกสต็อกแล้ว ✓\nอัปเดต ${data.updated ?? 0} · เพิ่มใหม่ ${data.inserted ?? 0} รายการ`);
    } catch (e: any) {
      window.alert(`บันทึกไม่สำเร็จ: ${e?.message ?? e}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-24">
      <PageTitle title="กรอกสต็อกรายวัน" right={<Badge tone="blue">{thaiDate(date)}</Badge>} />

      <GlassCard className="mb-3">
        <div className="grid gap-3">
          <Segmented options={BRANCH_OPTS} value={branch} onChange={setBranch} />
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-brand-ink/50">วันที่</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field" />
          </label>
        </div>
      </GlassCard>

      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <Stat label="กรอกแล้ว" value={`${filledCount}/${total}`} />
        <Stat
          label="เกิน / ผิด"
          value={errorCount > 0 ? `⚠️ ${errorCount}` : "—"}
          tone={errorCount > 0 ? "warn" : "default"}
        />
      </div>

      {err && (
        <GlassCard className="mb-3">
          <p className="text-sm text-warn">โหลดข้อมูลไม่สำเร็จ: {err}</p>
        </GlassCard>
      )}

      {loading ? (
        <GlassCard><p className="text-sm text-brand-ink/50">กำลังโหลด…</p></GlassCard>
      ) : groups.length === 0 ? (
        <GlassCard><p className="text-sm text-brand-ink/50">ไม่มีรายการสต็อกสำหรับสาขานี้</p></GlassCard>
      ) : (
        groups.map((g, gi) => (
          <Accordion key={g.category} title={g.category} count={`${g.items.length} รายการ`} defaultOpen={gi === 0}>
            <div className="grid gap-2 py-1">
              {g.items.map((it) => {
                const row = rows[it.id];
                if (!row) return null;
                const N = it.gramsPerUOM;
                const d = derive(row, N);
                const filled = isFilled(row);
                const v = varianceOf(row);
                const su = it.isCup ? "ชิ้น" : "g"; // หน่วยย่อย: ถ้วยนับชิ้น · อื่นเป็นกรัม
                const grp = it.remainderGroup;
                const isLeader = !!grp && groupIds.get(grp)?.[0] === it.id;
                const gt = grp ? groupTotals(grp) : null;
                const leaderName = gt ? itemById.get(gt.leaderId)?.name ?? "" : "";
                const par = meta?.par[it.id]?.[branch] ?? null;

                return (
                  <div key={it.id} className="glass-soft px-3 py-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{it.name}</span>
                      <div className="flex flex-shrink-0 items-center gap-1.5">
                        {par != null && <Badge tone="blue">Par {par}</Badge>}
                        <Badge>{it.unit}</Badge>
                      </div>
                    </div>

                    {(it.hasRemainder || grp) && (
                      <div className="mb-1 text-[11px] font-medium text-brand-ink/50">
                        {grp ? "เต็ม (กล่อง)" : "เต็ม (แพ็ค)"}{N > 0 ? ` · 1 ${grp ? "กล่อง" : "แพ็ค"} = ${N} ${su}` : ""}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <NumberField label="ยกมา" value={row.carryPack} readOnly tone="ro" />
                      <NumberField label="รับเข้า" value={blankZero(row.inPack)}
                        onChange={(x) => setField(it.id, "inPack", x, N)} />
                      <NumberField label={it.hasRemainder || grp ? "แกะ/ออก" : "ขาย/ใช้"} value={blankZero(row.used)}
                        onChange={(x) => setField(it.id, "used", x, N)} />
                      <NumberField label="คงเหลือ" value={row.remainPack}
                        onChange={(x) => setField(it.id, "remainPack", x, N)} tone="auto" />
                    </div>

                    {/* ส่งคืน/เสีย → หักจากยอด stock · ถ้ากรอก ให้ใส่หมายเหตุ */}
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <NumberField label="ส่งคืน/เสีย" value={blankZero(row.returned)}
                        onChange={(x) => setField(it.id, "returned", x, N)} />
                      {row.returned > 0 && (
                        <label className="flex flex-col gap-1">
                          <span className="text-[11px] text-brand-ink/50">หมายเหตุ (ส่งคืน/เสีย)</span>
                          <input className="field text-left text-sm" placeholder="เหตุผล เช่น หมดอายุ / แตก"
                            value={row.note} onChange={(e) => setNote(it.id, e.target.value)} />
                        </label>
                      )}
                    </div>

                    {/* เศษ: กลุ่ม (เฉพาะ leader) / แกะปกติ */}
                    {grp ? (
                      isLeader ? (
                        <>
                          <div className="mb-1 mt-2 text-[11px] font-medium text-brand-ink/50">
                            🔗 เศษรวมกลุ่ม {grp} (g) — กรอกที่รายการนี้ที่เดียว
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <NumberField label="ยกมา g" value={row.carryG} readOnly tone="ro" />
                            <NumberField label="รับเข้า g" value={blankZero(row.inG)}
                              onChange={(x) => setField(it.id, "inG", x, N)} />
                            <NumberField label="เศษคงเหลือ g" value={row.remainG}
                              onChange={(x) => setField(it.id, "remainG", x, N)} tone="auto" />
                          </div>
                        </>
                      ) : (
                        <div className="mt-2 rounded-lg bg-black/[.03] px-2.5 py-1.5 text-[11px] text-brand-ink/50">
                          🔗 เศษรวมกลุ่ม {grp} — กรอกที่ “{leaderName}”
                        </div>
                      )
                    ) : it.hasRemainder ? (
                      <>
                        <div className="mb-1 mt-2 text-[11px] font-medium text-brand-ink/50">
                          {it.isCup ? `เศษ (${su}) — ถ้วยเปิดแพ็ค` : `เศษ (${su}) — Sale Unit`}
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <NumberField label={`ยกมา ${su}`} value={row.carryG} readOnly tone="ro" />
                          <NumberField label={`รับเข้า ${su}`} value={blankZero(row.inG)}
                            onChange={(x) => setField(it.id, "inG", x, N)} />
                          <NumberField label={`ขาย/ใช้ ${su}`} value={blankZero(Math.max(d.usedTotalG, 0))}
                            onChange={(x) => setField(it.id, "usedG", x, N)} />
                          <NumberField label={`คงเหลือ ${su}`} value={row.remainG}
                            onChange={(x) => setField(it.id, "remainG", x, N)} tone="auto" />
                        </div>
                      </>
                    ) : null}

                    {/* validation */}
                    {grp ? (
                      isLeader && gt ? (
                        gt.overG > 0 ? (
                          <div className="mt-2 rounded-lg bg-warn/15 px-2.5 py-1.5 text-xs font-medium text-warn">
                            ⚠️ เศษรวมกลุ่ม {grp} เกินของที่มี (เกิน {gt.overG} g)
                          </div>
                        ) : (
                          <div className="mt-2 rounded-lg bg-ok/15 px-2.5 py-1.5 text-xs font-medium text-ok">
                            ✓ กลุ่ม {grp}: ใช้ไปรวม {gt.usedG} g · คงเหลือรวม {gt.remainG} g (มี {gt.availG} g)
                          </div>
                        )
                      ) : null
                    ) : it.hasRemainder ? (
                      d.overG > 0 ? (
                        <div className="mt-2 rounded-lg bg-warn/15 px-2.5 py-1.5 text-xs font-medium text-warn">
                          ⚠️ คงเหลือรวมเกินของที่มี (เกิน {d.overG} {su}){N > 0 ? ` ≈ ${(d.overG / N).toFixed(2)} แพ็ค` : ""}
                        </div>
                      ) : (filled || it.isCup) ? (
                        <div className={`mt-2 rounded-lg px-2.5 py-1.5 text-xs font-medium ${it.isCup ? "bg-brand-blue/20 text-sky-700" : "bg-ok/15 text-ok"}`}>
                          {it.isCup
                            ? `📊 รวมทั้งหมด ${d.remainTotalG} ชิ้น (บันทึกวันนี้) · ใช้/ขาย ${d.usedTotalG} ชิ้น — กระทบยอดที่หน้า "ถ้วย"`
                            : `✓ รวมใช้ไป ${d.usedTotalG} ${su} · คงเหลือรวม ${d.remainTotalG} ${su} (มี ${d.availTotalG} ${su})`}
                        </div>
                      ) : null
                    ) : v !== 0 ? (
                      <div className="mt-2 rounded-lg bg-warn/15 px-2.5 py-1.5 text-xs font-medium text-warn">
                        ⚠️ ยอดไม่ตรง (ต่าง {v > 0 ? "+" : ""}{v})
                      </div>
                    ) : filled ? (
                      <div className="mt-2 rounded-lg bg-ok/15 px-2.5 py-1.5 text-xs font-medium text-ok">
                        ✓ ยอดตรง
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Accordion>
        ))
      )}

      <SaveBar>
        <Button onClick={handleSave} disabled={saving || loading}>
          {saving ? "กำลังบันทึก…" : "บันทึกสต็อกวันนี้"}
        </Button>
      </SaveBar>
    </div>
  );
}
