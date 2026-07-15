"use client";
// Settings — ตั้งค่าโหมดขายต่อ item (แกะ g / เต็มกล่อง + กรัมต่อ 1 แพ็ค)
import React from "react";
import type { Item, Meta } from "@/lib/types";
import {
  GlassCard, Badge, Button, Segmented, Accordion, NumberField, PageTitle,
} from "@/components/ui";

type Draft = { hasRemainder: boolean; gramsPerUOM: number; remainderGroup: string };

export default function SettingsPage() {
  const [meta, setMeta] = React.useState<Meta | null>(null);
  const [draft, setDraft] = React.useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [onlyBox, setOnlyBox] = React.useState(true);

  const load = React.useCallback(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((m: Meta) => {
        setMeta(m);
        const d: Record<string, Draft> = {};
        for (const it of m.items) d[it.id] = { hasRemainder: it.hasRemainder, gramsPerUOM: it.gramsPerUOM, remainderGroup: it.remainderGroup ?? "" };
        setDraft(d);
      })
      .catch((e) => setErr(String(e?.message ?? e)));
  }, []);
  React.useEffect(load, [load]);

  const items = React.useMemo(() => {
    if (!meta) return [] as Item[];
    const list = [...meta.items].sort((a, b) => a.sort - b.sort);
    return onlyBox ? list.filter((it) => /box/i.test(it.unit) || it.hasRemainder) : list;
  }, [meta, onlyBox]);

  const groups = React.useMemo(() => {
    const out: { category: string; items: Item[] }[] = [];
    for (const it of items) {
      let g = out.find((x) => x.category === it.category);
      if (!g) { g = { category: it.category, items: [] }; out.push(g); }
      g.items.push(it);
    }
    return out;
  }, [items]);

  function dirty(it: Item): boolean {
    const d = draft[it.id];
    return !!d && (d.hasRemainder !== it.hasRemainder || d.gramsPerUOM !== it.gramsPerUOM || d.remainderGroup !== (it.remainderGroup ?? ""));
  }

  async function save(it: Item) {
    const d = draft[it.id];
    if (!d) return;
    setSavingId(it.id);
    setErr(null);
    try {
      const res = await fetch("/api/items/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: it.id, hasRemainder: d.hasRemainder, gramsPerUOM: d.gramsPerUOM, remainderGroup: d.remainderGroup }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      // อัปเดต meta ในหน่วยความจำให้ตรง
      setMeta((m) => m && ({
        ...m,
        items: m.items.map((x) => x.id === it.id
          ? { ...x, hasRemainder: d.hasRemainder, gramsPerUOM: d.gramsPerUOM, remainderGroup: d.remainderGroup || undefined }
          : x),
      }));
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4 pb-24">
      <PageTitle title="ตั้งค่าสินค้า" right={<Badge tone="blue">โหมดขาย</Badge>} />
      <GlassCard className="mb-3">
        <p className="text-sm text-brand-ink/70">
          ตั้งได้ว่าแต่ละสินค้าขายแบบ <b>แกะ (นับเศษ g)</b> หรือ <b>เต็มกล่อง</b> · ถ้าแกะ ให้ใส่ <b>กรัมต่อ 1 แพ็ค</b> เพื่อคำนวณ
        </p>
        <div className="mt-3">
          <Segmented
            options={[{ value: "box", label: "เฉพาะสินค้ากล่อง" }, { value: "all", label: "ทั้งหมด" }]}
            value={onlyBox ? "box" : "all"}
            onChange={(v) => setOnlyBox(v === "box")}
          />
        </div>
      </GlassCard>

      {err && <GlassCard className="mb-3"><p className="text-sm text-warn">{err}</p></GlassCard>}

      {!meta ? (
        <GlassCard><p className="text-sm text-brand-ink/50">กำลังโหลด…</p></GlassCard>
      ) : (
        groups.map((g, gi) => (
          <Accordion key={g.category} title={g.category} count={`${g.items.length} รายการ`} defaultOpen={gi < 2}>
            <div className="grid gap-2 py-1">
              {g.items.map((it) => {
                const d = draft[it.id] ?? { hasRemainder: it.hasRemainder, gramsPerUOM: it.gramsPerUOM };
                return (
                  <div key={it.id} className="glass-soft px-3 py-2.5">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">{it.name}</span>
                      <Badge>{it.unit}</Badge>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Segmented
                        options={[{ value: "open", label: "แกะ (เศษ g)" }, { value: "whole", label: "เต็มกล่อง" }]}
                        value={d.hasRemainder ? "open" : "whole"}
                        onChange={(v) =>
                          setDraft((prev) => ({ ...prev, [it.id]: { ...d, hasRemainder: v === "open" } }))
                        }
                      />
                      <div>
                        <NumberField
                          label={d.remainderGroup ? "กรัมต่อ 1 กล่อง (ขนาด)" : "กรัมต่อ 1 แพ็ค (g/UOM)"}
                          value={d.gramsPerUOM === 0 ? "" : d.gramsPerUOM}
                          onChange={(x) =>
                            setDraft((prev) => ({ ...prev, [it.id]: { ...d, gramsPerUOM: parseFloat(x) || 0 } }))
                          }
                        />
                      </div>
                    </div>
                    <label className="mt-2 flex flex-col gap-1">
                      <span className="text-[11px] text-brand-ink/50">กลุ่มเศษรวม (เว้นว่าง = ไม่มี · เศษปนกัน เช่น Strawberry)</span>
                      <input
                        className="field text-left"
                        placeholder="เช่น Strawberry, Blueberry"
                        value={d.remainderGroup}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, [it.id]: { ...d, remainderGroup: e.target.value } }))
                        }
                      />
                    </label>
                    {dirty(it) && (
                      <div className="mt-2">
                        <Button variant="ghost" onClick={() => save(it)} disabled={savingId === it.id}>
                          {savingId === it.id ? "กำลังบันทึก…" : "บันทึกรายการนี้"}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Accordion>
        ))
      )}
    </div>
  );
}
