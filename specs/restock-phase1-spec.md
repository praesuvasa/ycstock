# Restock หน้าเติมของ — เฟส 1 Spec (System Analyst)

> ขอบเขต: 4 เรื่องที่แพรขอ — (1+2) persist ตัวเลือกเติมของลง DB, (3) บังคับยืนยันวันที่/สาขาก่อนเห็นรายการ, (4) โชว์เศษ CUP เป็นชิ้น
> ห้ามแก้โค้ดจริง — ไฟล์นี้คือ spec ให้ yc-dev ทำต่อ
> อ่านโค้ดอ้างอิงจาก: `src/app/restock/page.tsx`, `src/lib/types.ts`, `src/lib/db.ts`, `src/lib/supabase.ts`, `src/lib/store-memory.ts`, `src/app/api/restock/route.ts`, `src/lib/seed-data.ts`, `src/app/api/requisitions/route.ts` + migration `0013_requisitions.sql`/`0014_requisitions_seen.sql`, `src/lib/authz.ts`, `src/lib/audit.ts`, `src/app/api/stock/route.ts`, `src/components/ui/index.tsx` (SaveBar/Button)

---

## 0. สรุป design decision หลัก (อ่านก่อน)

1. **ตาราง key เดียวกับ `stock_daily`** คือ `(date, branch_id, item_id)` — "ประวัติ" เกิดขึ้นเองโดยธรรมชาติเพราะคนละวันที่ = คนละแถวอยู่แล้ว (เหมือน `stock_daily` ที่ไม่มีใครบ่นว่าไม่มีประวัติ) ไม่ต้องทำ event-sourcing/log แยกอีกชั้น การบันทึกซ้ำวันเดียวกัน = upsert ทับ (ตามที่ต้องการ "เห็นค่าล่าสุด") — ส่วน audit trail "ใครบันทึกทับเมื่อไหร่" ใช้ `audit_log` เดิม (เขียนทุกครั้งที่ save สำเร็จ เหมือน `save_stock`)
2. **โหมด B (สั่งผลิต) ไม่ผูกกับวันที่เดียว** — แต่ละสาขาเลือกวันเติมของของตัวเอง (คนละวันกันได้) หน้าสั่งผลิตต้องเห็น "ค่าล่าสุดที่แต่ละสาขาบันทึกไว้" ไม่ว่าจะเป็นวันที่ไหน จึงต้องมี endpoint แยกที่ query แบบ "ล่าสุดต่อ (สาขา,ไอเทม)" ไม่ filter ด้วย date เดียว — ใช้ pattern เดียวกับ `getStock`'s `prevMap` (query แล้ว reduce แบบ "last wins" ใน JS แทนการใช้ `DISTINCT ON` ของ Postgres ที่ supabase-js เรียกตรงไม่ได้ ต้องพึ่ง RPC — เลี่ยงเพิ่ม RPC ใหม่ในเฟสนี้)
3. **date-confirm gate เป็น client-side + localStorage เท่านั้น** ไม่ต้องมี API ใหม่ — เก็บ "คู่ (สาขา,วันที่) ล่าสุดที่ยืนยันแล้ว" ไว้ที่เครื่อง ถ้า pair ตรงกับที่เพิ่งยืนยัน ไม่ต้อง gate ซ้ำ

---

## 1. Data model — SQL Migration

ไฟล์ใหม่: **`supabase/migrations/0017_restock_selections.sql`** (ล่าสุดในระบบตอนนี้คือ `0016_peanut_butter_remove.sql`)

```sql
-- เก็บ "ตัวเลือกเติมของ" ต่อ (สาขา, วันที่, ไอเทม) ลง DB แทน client memory เดิม (RestockStore ใน restock/page.tsx)
-- แก้ 2 ปัญหา: (ก) พนักงานกลับมาแก้/ปริ้นซ้ำต้องเห็นค่าที่เคยบันทึกไว้ล่าสุด ไม่ reset กลับเป็นค่า PAR อัตโนมัติ
--              (ข) หน้าสั่งผลิต (โหมด B) ต้องเห็นรวมทุกสาขาที่เลือกไว้แล้ว ไม่ว่าใครกรอกจากเครื่องไหน/เมื่อไหร่ — ต้อง query จาก DB
-- key เดียวกับ stock_daily (date, branch_id, item_id) — "ประวัติ" เกิดขึ้นเองเพราะคนละวันที่ = คนละแถวอยู่แล้ว
-- บันทึกซ้ำวันเดียวกัน = upsert ทับค่าเดิมตามต้องการ (เห็นค่าล่าสุด) — audit trail ของการ save อยู่ที่ audit_log (action=save_restock_selection) อยู่แล้ว ไม่ต้องมี log ซ้อนอีกชั้น
create table if not exists restock_selections (
  id                  bigint generated always as identity primary key,
  date                date not null,
  branch_id           text not null references branches(id),
  item_id             text not null references items(id),
  selected            boolean not null default false,
  qty                 numeric not null default 0,
  updated_by_user_id  text not null default 'system',
  updated_by_name     text not null default '',
  updated_at          timestamptz not null default now(),
  unique (date, branch_id, item_id)
);

-- query หลักของหน้าเติมของ (โหมด A): where date=? and branch_id=? → ใช้ unique constraint ข้างบนพอ (มี index มาให้จาก unique)
-- query หลักของหน้าสั่งผลิต (โหมด B): "ค่าล่าสุดต่อ (branch_id,item_id)" ไม่ผูก date เดียว → ต้อง scan ทุกแถว selected=true เรียงตาม date,updated_at
create index if not exists idx_restock_sel_latest on restock_selections (branch_id, item_id, date, updated_at);

alter table restock_selections disable row level security; -- แอปเข้าถึงผ่าน BFF (service role) เท่านั้น เหมือนตารางอื่นทั้งหมด
```

**หมายเหตุ backward-compat:** เป็นตารางใหม่ล้วนๆ ไม่แตะ `stock_daily`/`requisitions`/`sales_daily`/`cup_reconcile`/`items`/`par_levels` เลย — deploy migration นี้แล้วระบบเดิมทำงานเหมือนเดิมทุกอย่างจนกว่าจะ deploy โค้ด BFF/UI ใหม่ที่เรียกตารางนี้ (migration มาก่อน code ได้อย่างปลอดภัย)

---

## 2. TypeScript types — เพิ่มใน `src/lib/types.ts`

```ts
// ── Restock selections persisted (v1.4) — เก็บ "ตัวเลือกเติมของ" ต่อ (สาขา,วันที่,ไอเทม) ลง DB แทน client memory ──
export interface RestockSelectionEntry {
  itemId: string;
  selected: boolean;
  qty: number;
}

// แถวรวมข้ามสาขา ใช้ในหน้าสั่งผลิต (โหมด B) — ค่าล่าสุดต่อ (สาขา,ไอเทม) ไม่ผูกกับวันที่เดียว
// (สาขาแต่ละที่เลือกวันเติมของของตัวเอง คนละวันกันได้)
export interface RestockSelectionLatestRow {
  itemId: string;
  branch: Branch;
  qty: number;
  date: string;       // วันที่ restock ที่ค่านี้มาจาก (debug/tooltip เผื่อค่าดูแปลก)
  updatedAt: string;   // ISO
}
```

แก้ `RestockRow` (บรรทัด 81-92 เดิม) — เพิ่ม field `isCup` สำหรับข้อ 4:

```ts
export interface RestockRow {
  itemId: string;
  name: string;
  category: string;
  unit: string;
  par: number | null;
  remain: number;
  need: number | null;
  isSpecial: boolean;
  // เศษกรัมคงเหลือในแพ็คที่เปิดอยู่วันนี้ — มีความหมายเฉพาะรายการที่ showRemainderOnRestock=true
  remainG?: number;
  // true = 4 รายการ Cup P(5oz)/Cup S(9oz)/Small Bowl/Cup(14oz) → remainG ข้างบนคือ "จำนวนชิ้น" ไม่ใช่กรัม (ข้อ 4)
  isCup?: boolean;
}
```

---

## 3. API routes ใหม่

ไฟล์ใหม่: **`src/app/api/restock/selections/route.ts`** (GET/POST สำหรับโหมด A ต่อ branch+date เดียว)

```
GET /api/restock/selections?branch=NVP&date=2026-07-22
  → auth: requireAdminOrRestock() (เหมือน GET /api/restock เดิม)
  → response: { entries: Record<string, { selected: boolean; qty: number }> }   // key = itemId
  → ถ้ายังไม่เคย save (branch,date) นี้เลย → entries = {} (ไม่ error) — client รู้ว่าต้อง fallback ไป default จาก need/PAR เหมือนพฤติกรรมเดิม

POST /api/restock/selections
  body: { branch: string; date: string; entries: RestockSelectionEntry[] }
  → auth: requireAdminOrRestock()
  → upsert entries "ทุกตัว" รวม selected=false ด้วย (ไม่ใช่แค่ที่เลือก) — เพื่อรักษาความหมาย
    "เคยตัดสินใจแล้วว่าไม่เอารายการนี้" ให้ต่างจาก "ยังไม่เคยแตะเลย" (มีผลตอนโหลดครั้งถัดไปว่าจะ fallback ไป default PAR หรือไม่ — ดูข้อ 5.2)
  → เขียน audit_log: action="save_restock_selection", branch, date, detail=`บันทึกตัวเลือกเติมของ ${entries.length} รายการ (เลือก ${selectedCount})`
  → response: { ok: true, savedCount: number }
```

ไฟล์ใหม่: **`src/app/api/restock/selections/latest/route.ts`** (GET สำหรับโหมด B รวมทุกสาขา)

```
GET /api/restock/selections/latest
  → auth: requireAdminOrRestock()
  → ไม่ต้องมี query param — คืนค่าล่าสุดของ "ทุกสาขา" พร้อมกัน (โหมด B ต้องใช้ทุกสาขาอยู่แล้ว)
  → response: { rows: RestockSelectionLatestRow[] }   // เฉพาะ selected=true, 1 แถวต่อ (branch,itemId) ค่าล่าสุด
```

รูปแบบ error response ทั้งคู่ให้ตาม pattern เดิมทุก route ในระบบ (`{ error: string }` + status จาก `authErrorResponse`/400/500)

---

## 4. `db.ts` / `supabase.ts` / `store-memory.ts` — methods ที่ต้องเพิ่ม

### `src/lib/db.ts` (เพิ่มต่อท้าย object `db`, import `RestockSelectionEntry`, `RestockSelectionLatestRow` เพิ่ม)

```ts
// ── restock selections (v1.4) ──
getRestockSelections: (branch: Branch, date: string): Promise<Record<string, { selected: boolean; qty: number }>> =>
  useSupabase ? supabaseStore.getRestockSelections(branch, date) : Promise.resolve(memoryStore.getRestockSelections(branch, date)),

saveRestockSelections: (branch: Branch, date: string, entries: RestockSelectionEntry[], userId: string, userName: string) =>
  useSupabase
    ? supabaseStore.saveRestockSelections(branch, date, entries, userId, userName)
    : Promise.resolve(memoryStore.saveRestockSelections(branch, date, entries, userId, userName)),

getLatestRestockSelections: (): Promise<RestockSelectionLatestRow[]> =>
  useSupabase ? supabaseStore.getLatestRestockSelections() : Promise.resolve(memoryStore.getLatestRestockSelections()),
```

### `src/lib/supabase.ts` (เพิ่มใน `supabaseStore`, ก่อน `// ── audit ──`)

```ts
// ── ตัวเลือกเติมของ (v1.4) ──
async getRestockSelections(branch: Branch, date: string): Promise<Record<string, { selected: boolean; qty: number }>> {
  const { data, error } = await sb().from("restock_selections")
    .select("item_id,selected,qty").eq("branch_id", branch).eq("date", date);
  if (error) throw error;
  const out: Record<string, { selected: boolean; qty: number }> = {};
  for (const r of data ?? []) out[r.item_id] = { selected: r.selected, qty: Number(r.qty) };
  return out;
},

async saveRestockSelections(branch: Branch, date: string, entries: RestockSelectionEntry[], userId: string, userName: string) {
  const now = new Date().toISOString();
  const payload = entries.map((e) => ({
    date, branch_id: branch, item_id: e.itemId,
    selected: e.selected, qty: e.qty,
    updated_by_user_id: userId, updated_by_name: userName, updated_at: now,
  }));
  const { error } = await sb().from("restock_selections").upsert(payload, { onConflict: "date,branch_id,item_id" });
  if (error) throw error;
  return { ok: true, savedCount: payload.length };
},

// โหมดสั่งผลิต: ค่าล่าสุดต่อ (สาขา,ไอเทม) ไม่ผูกวันที่เดียว (แต่ละสาขา restock คนละวันได้)
// reduce แบบเดียวกับ getStock's prevMap — query ที่ selected=true เรียง date,updated_at asc แล้วให้ตัวหลังทับตัวก่อน (last wins = ค่าล่าสุดจริง)
async getLatestRestockSelections(): Promise<RestockSelectionLatestRow[]> {
  const { data, error } = await sb().from("restock_selections")
    .select("item_id,branch_id,qty,date,updated_at")
    .eq("selected", true)
    .order("date", { ascending: true })
    .order("updated_at", { ascending: true })
    .limit(5000); // กันโตไม่จำกัดในระยะยาว — ถ้าข้อมูลเยอะขึ้นค่อยเติม .gte("date", cutoff) ตัดช่วงย้อนหลัง เช่น 60 วัน
  if (error) throw error;
  const map = new Map<string, RestockSelectionLatestRow>();
  for (const r of data ?? []) {
    map.set(r.item_id + "|" + r.branch_id, {
      itemId: r.item_id, branch: r.branch_id as Branch, qty: Number(r.qty), date: r.date, updatedAt: r.updated_at,
    });
  }
  return [...map.values()];
},
```

แก้ `getRestock` (บรรทัด ~104-106) — เติม `isCup` เข้า RestockRow:

```ts
rows.push({ itemId: it.id, name: it.name, category: it.category, unit: it.unit,
  par: p, remain, need: restockNeed(p, remain), isSpecial: it.isSpecial,
  remainG: it.showRemainderOnRestock ? (remainGMap.get(it.id) ?? 0) : undefined,
  isCup: it.isCup || undefined });
```

### `src/lib/store-memory.ts` (เพิ่ม Map ใหม่ + methods)

เพิ่มบรรทัดใกล้ `const stock = new Map<...>` (บรรทัด ~22-28):

```ts
interface RestockSelectionRec { date: string; branch: Branch; itemId: string; selected: boolean; qty: number; updatedByUserId: string; updatedByName: string; updatedAt: string; }
const restockSelections = new Map<string, RestockSelectionRec>(); // key = `${date}|${branch}|${itemId}` — ใช้ sk() เดิมได้เลย
```

เพิ่ม methods ใน `memoryStore` (ก่อน `// ── audit ──`):

```ts
// ── ตัวเลือกเติมของ (v1.4) ──
getRestockSelections(branch: Branch, date: string): Record<string, { selected: boolean; qty: number }> {
  const out: Record<string, { selected: boolean; qty: number }> = {};
  for (const rec of restockSelections.values()) {
    if (rec.branch !== branch || rec.date !== date) continue;
    out[rec.itemId] = { selected: rec.selected, qty: rec.qty };
  }
  return out;
},

saveRestockSelections(branch: Branch, date: string, entries: RestockSelectionEntry[], userId: string, userName: string) {
  const now = new Date().toISOString();
  for (const e of entries) {
    restockSelections.set(sk(date, branch, e.itemId), {
      date, branch, itemId: e.itemId, selected: e.selected, qty: e.qty,
      updatedByUserId: userId, updatedByName: userName, updatedAt: now,
    });
  }
  return { ok: true, savedCount: entries.length };
},

getLatestRestockSelections(): RestockSelectionLatestRow[] {
  const map = new Map<string, RestockSelectionLatestRow>();
  const sorted = [...restockSelections.values()]
    .filter((r) => r.selected)
    .sort((a, b) => (a.date === b.date ? a.updatedAt.localeCompare(b.updatedAt) : a.date.localeCompare(b.date)));
  for (const r of sorted) {
    map.set(r.itemId + "|" + r.branch, { itemId: r.itemId, branch: r.branch, qty: r.qty, date: r.date, updatedAt: r.updatedAt });
  }
  return [...map.values()];
},
```

แก้ `getRestock` (บรรทัด ~141-145) — เติม `isCup` เหมือนฝั่ง supabase:

```ts
rows.push({
  itemId: it.id, name: it.name, category: it.category, unit: it.unit,
  par, remain, need: restockNeed(par, remain), isSpecial: it.isSpecial,
  remainG: it.showRemainderOnRestock ? (remainGMap.get(it.id) ?? 0) : undefined,
  isCup: it.isCup || undefined,
});
```

---

## 5. UI flow — `src/app/restock/page.tsx`

### 5.1 โครงสร้างที่เปลี่ยน — เลิกใช้ `RestockStore` แบบยกขึ้น `RestockPage`

ปัจจุบัน `store`/`setStore` (state ที่ `RestockPage`, บรรทัด 244) มีไว้ "เชื่อม" โหมด A → โหมด B ในหน้าเดียวกัน (browser tab เดียว) — ของใหม่ต้องเชื่อมกันผ่าน DB แทน (เพราะคนละอุปกรณ์/เวลากันได้) ดังนั้น:

- **ลบ** `RestockStore`, `RestockEntry`, `storeKey`, `store`/`setStore` state ที่ `RestockPage` (บรรทัด 78-82, 242-262 ส่วน state)
- `RestockByBranch` ถือ local editing buffer ของตัวเอง (ยังเป็น React state เหมือนเดิม เพื่อพิมพ์ลื่นไม่หน่วง) แต่ **hydrate จาก API แทนการ default จาก need เท่านั้น** (ดู 5.2) และไม่รับ/ส่ง prop `store` อีกต่อไป
- `ProductionOrder` **เลิกรับ prop `store`** — ดึง `reflected` เองจาก `GET /api/restock/selections/latest` (ดู 5.3)
- `RestockPage` เหลือแค่ mode toggle เหมือนเดิม ไม่ต้องถือ state ข้ามโหมดอีก

### 5.2 โหมด A (`RestockByBranch`) — hydrate จาก DB + ปุ่มบันทึกชัดเจน

**เปลี่ยน useEffect โหลดข้อมูล (บรรทัด 290-325 เดิม):**
หลัง fetch `/api/restock` (rows) แล้ว ให้ fetch เพิ่ม `GET /api/restock/selections?branch=&date=` แบบขนาน (`Promise.all`) แล้ว seed `entries` ด้วยตรรกะนี้:

```
สำหรับแต่ละ row ใน rows:
  ถ้า saved.entries[row.itemId] มีอยู่ → ใช้ค่าจาก DB ตรงๆ (selected, qty) — นี่คือ requirement (ก): เห็นค่าที่เคยบันทึกไว้ล่าสุด ไม่ reset
  ถ้าไม่มี (แถวนี้ไม่เคยถูก save มาก่อนสำหรับ (branch,date) นี้เลย) → fallback ไป default เดิม (selected = need>0, qty = need)
```

**หมายเหตุสำคัญ:** เพราะ POST บันทึก "ทุกแถว" (รวม selected=false) เสมอ (ดูข้อ 3) ดังนั้นถ้าเคย save ไปแล้วครั้งหนึ่ง ทุก itemId ที่ตอนนั้นมีอยู่ใน `rows` จะมี entry ใน DB แน่นอน (ไม่ mix ค่า default เข้ามาแทรก) — fallback เกิดเฉพาะกรณี "ยังไม่เคย save (branch,date) คู่นี้เลย" หรือ "มีไอเทมใหม่ที่เพิ่งเพิ่มเข้าระบบหลังจากที่เคย save ครั้งก่อน" (เคสหลังนี้ค่อนข้างขอบ — ยอมรับได้ที่จะ fallback ไป default PAR สำหรับไอเทมใหม่นั้น)

**เพิ่ม state:** `const [selEntries, setSelEntries] = React.useState<Record<string, RestockSelectionEntry>>({})` (แทนที่ตัวแปร `entries` เดิมที่มาจาก `store[key]`) — logic `updateEntry`/`toggleItem`/`toggleCategoryAll`/`toggleAllGlobal` เดิม (บรรทัด 332-358) ปรับ signature ให้ทำงานกับ `selEntries` local แทน `setStore`

**เพิ่มปุ่ม "บันทึก"** ในแถบปุ่มล่าง (บรรทัด 543-560 เดิม มี Export/Print 2 ปุ่ม) — เปลี่ยนเป็น 3 ปุ่ม หรือใช้ `SaveBar` (component ที่มีอยู่แล้ว ใช้ใน `stock/page.tsx`) sticky ด้านล่าง ให้ตรงกับ pattern เดิมของระบบ:

```tsx
<SaveBar>
  <Button onClick={handleSave} disabled={saving || loading}>
    {saving ? "กำลังบันทึก…" : "💾 บันทึกตัวเลือก"}
  </Button>
  {lastSavedAt && <span className="text-xs text-brand-ink/50">บันทึกล่าสุด {formatTime(lastSavedAt)}</span>}
</SaveBar>
```

`handleSave()`:
```
POST /api/restock/selections { branch, date, entries: rows.map(r => ({ itemId: r.itemId, selected: selEntries[r.itemId]?.selected ?? false, qty: Number(selEntries[r.itemId]?.qty ?? 0) })) }
สำเร็จ → setLastSavedAt(new Date())
ล้มเหลว → window.alert (ตาม pattern handleSave ใน stock/page.tsx)
```

**Export CSV / พิมพ์ใบส่งของ ไม่ต้องรอ save** — ยังทำงานจาก `selEntries` ปัจจุบันได้เลยเหมือนเดิม (ไม่บังคับ save ก่อน export เพราะพนักงานอาจแค่พิมพ์ไปเช็คของหน้างานโดยยังไม่ได้ยืนยันสุดท้าย) — แต่ **แนะนำ**: ใส่ hint เล็กๆ ใต้ปุ่ม export/print ว่า "อย่าลืมกด 'บันทึกตัวเลือก' ก่อนออกจากหน้านี้ ถ้าอยากให้หน้าสั่งผลิตเห็นค่าล่าสุด" (กัน user งงว่าทำไมสั่งผลิตไม่เห็นของที่เพิ่งติ๊ก)

### 5.3 โหมด B (`ProductionOrder`) — ดึง `reflected` จาก DB แทน prop `store`

แก้ `ProductionOrder` (บรรทัด 737 เดิม) — เอา `{ store }: { store: RestockStore }` ออกจาก props signature (ไม่รับ prop แล้ว)

เพิ่ม fetch คู่กับ `/api/meta` (บรรทัด 742-750 เดิม) — `Promise.all([fetch("/api/meta"), fetch("/api/restock/selections/latest")])` แล้วเก็บผลที่สองเป็น `const [latestRows, setLatestRows] = React.useState<RestockSelectionLatestRow[]>([])`

แก้ `reflected` (บรรทัด 800-819 เดิม) จาก loop `store` → loop `latestRows` ตรงๆ (ไม่ต้องมี logic เทียบ timestamp เองแล้ว เพราะ backend ทำ "last wins" ให้แล้วในชั้น query):

```ts
const reflected = React.useMemo(() => {
  const out: Record<string, Partial<Record<Branch, string>>> = {};
  for (const r of latestRows) {
    if (!out[r.itemId]) out[r.itemId] = {};
    out[r.itemId][r.branch] = String(r.qty);
  }
  return out;
}, [latestRows]);
```

ที่เหลือ (`valuesFor`, `totalFor`, `isReflected`, badge "จาก Restock") **ไม่ต้องแก้** — ใช้ `reflected` ตัวเดิมได้เลยเพราะ shape เหมือนเดิมทุกอย่าง

### 5.4 ข้อ 3 — date-confirm gate (ทั้ง 2 โหมด)

**ไม่ต้องมี API ใหม่** — เก็บ state "ยืนยันแล้วหรือยัง" ที่ client เท่านั้น ผ่าน `localStorage` (per-device แม่นพอ เพราะ requirement คือกันลืมเปลี่ยนวันที่บนเครื่องเดียวกัน ไม่ใช่ sync ข้ามเครื่อง)

**Pattern เดียวกันใช้ทั้ง 2 โหมด** — เขียนเป็น hook เล็กๆ ใช้ร่วม เช่น `useConfirmGate(storageKey, currentPairJson)`:

```ts
function useConfirmGate(storageKey: string, pairKey: string) {
  const [confirmed, setConfirmed] = React.useState(false);
  React.useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    setConfirmed(saved === pairKey);
  }, [storageKey, pairKey]);
  function confirm() {
    localStorage.setItem(storageKey, pairKey);
    setConfirmed(true);
  }
  return { confirmed, confirm };
}
```

**โหมด A:**
- `pairKey = `${branch}|${date}`` , `storageKey = "yc:restock:gate:byBranch"`
- ใช้ `useConfirmGate("yc:restock:gate:byBranch", storeKeyOf(branch, date))`
- เปลี่ยนอะไรก็ตาม (branch หรือ date) → `pairKey` เปลี่ยน → `confirmed` กลับเป็น false อัตโนมัติ (ต้องกด "ยืนยัน" ใหม่)
- ถ้า `confirmed === true` (ตรงกับ pair ล่าสุดที่เคยกดยืนยันบนเครื่องนี้) → ข้าม gate ไปแสดงรายการเลย — **นี่คือส่วนที่ทำให้ "ไม่ใช่ modal บังคับทุกครั้งถ้าเป็นวันเดียวกับที่เพิ่งทำ"**
- UI: **ไม่ใช้ modal overlay** — แสดง inline แทนพื้นที่ GlassCard รายการสินค้า (บรรทัด 432-541 เดิม): ถ้า `!confirmed` → โชว์การ์ดสั้นๆ "ยืนยันสาขา + วันที่ก่อนเริ่มกรอก" + สรุป branch/date ที่เลือกอยู่ + ปุ่ม "✅ ยืนยัน เริ่มกรอกรายการ" แทนที่ checklist ทั้งหมด (branch/date picker ด้านบนยังแก้ได้ตามปกติ)
- **ผูกกับการ fetch ด้วย** — ย้าย `useEffect` ที่ยิง `GET /api/restock` + `GET /api/restock/selections` (บรรทัด 290-325) ให้รันเฉพาะตอน `confirmed === true` เท่านั้น (เพิ่ม `confirmed` เข้า dependency + early return ถ้า false) — กันยิง API เปล่าๆ ตอนผู้ใช้ยังเปลี่ยนวันที่ไปมาไม่นิ่ง

**โหมด B:**
- `pairKey = `${orderDate}|${deliveryDate}``, `storageKey = "yc:restock:gate:production"`
- แสดง gate แทนพื้นที่ mainGroups/dept2Items accordion ทั้งหมด (บรรทัด 941-977 เดิม) — เก็บ date picker การ์ด (บรรทัด 928-939) ไว้ด้านบนเสมอ ให้แก้ได้ก่อนยืนยัน
- fetch `/api/meta` + `/api/restock/selections/latest` ก็ยังทำได้ตลอด (ไม่ต้องรอ gate) เพราะไม่ผูกกับ orderDate/deliveryDate อยู่แล้ว (`reflected` เป็นค่าล่าสุดรวมทุกวันที่) — สิ่งที่ gate ไว้คือแค่ "การแก้ไข/เห็นตัวเลขในกริด" ไม่ใช่ fetch

### 5.5 สรุปพฤติกรรม gate ให้ตรงโจทย์ "ไม่รำคาญ"
- เปิดหน้าเช้าวันนี้ครั้งแรก, branch=NVP(auto จาก scope)/date=วันนี้ → ไม่เคยยืนยัน pair นี้มาก่อน → เจอ gate 1 ครั้ง กดยืนยัน
- สลับไปโหมด B แล้วกลับมาโหมด A (branch/date เดิม) → pair ตรงกับที่ localStorage เก็บไว้ → **ไม่เจอ gate ซ้ำ**
- ปิด browser tab แล้วเปิดใหม่วันเดียวกัน, branch/date เดิม → localStorage ยัง persist → **ไม่เจอ gate ซ้ำ**
- เปลี่ยนวันที่ (เช่น พลาดกดปีก/เดือนผิด) → pair เปลี่ยน → เจอ gate ทันที (ตรงจุดประสงค์ — กันกรอกผิดวัน)

---

## 6. ข้อ 4 — CUP remainder แสดงเป็น "ชิ้น" แทน "g"

**Step 1 — `src/lib/seed-data.ts`** เพิ่ม 4 รายการเข้า `SHOW_REMAINDER_ON_RESTOCK` set (บรรทัด 210-221 เดิม):

```ts
const SHOW_REMAINDER_ON_RESTOCK = new Set<string>([
  "Greek Yogurt 1kg", "Yuzu", "Kyoho", "Mint", "Vanilla", "Pineapple", "Biscoff",
  "Overnight oats biscoff", "Plain Yogurt (ธรรมชาติ)",
  "น้ำ Ice cream / Soft Serve", "Granola โรย Ice cream",
  "Cookies Crumbs", "Oreo", "Choc Chips", "Cornflakes (Topping)", "Granola (Topping)",
  "Almond", "Pecan", "Walnut", "Coconut Chips", "Chia Seed", "Flax Seed", "Cacao Nibs",
  "Grape Jelly", "Honey Jelly", "Apple Cinnamon",
  "Honey", "Caramel", "Peanut Butter Sauce",
  "ผงโกโก้ (COCOA)", "ผงมาคิ (MAQUI)", "ผงคาม (CAMU)", "น้ำเชื่อม (Syrup)",
  "Biscoff Spread เล็ก", "ซอส Chocolate", "ซอส Strawberry", "ปีโป้", "ปีโป้ลิ้นจี่",
  "พิสตาชิโอ้เครป", "พิสตาชิโอ้บัตเตอร์", "พิสตาชิโอ้ท๊อปปิ้ง",
  // ข้อ 4 (2026-07-21): 4 รายการ CUP — gramsPerUOM=50 (UOM1_QTY) จริงๆคือ "50 ชิ้น/แพ็ค" ไม่ใช่ 50 กรัม
  // โชว์เศษเป็นจำนวนชิ้นที่แกะแพ็คแล้วเหลือ (ไม่ใช่น้ำหนัก) — ดู isCup flag ใน RestockRow สำหรับ unit label
  "Cup P (5oz)", "Cup S (9oz)", "Small Bowl", "Cup (14oz)",
]);
```

`ITEMS` mapping ด้านล่าง (บรรทัด 225-245) **ไม่ต้องแก้** — `isCup: name in CUP_MAP` (บรรทัด 235) มีอยู่แล้วครบทั้ง 4 รายการนี้ตั้งแต่ต้น (`CUP_MAP` บรรทัด 157-159 มีครบ) แค่ต้องพา `isCup` นี้ไหลไปถึง `RestockRow` (ดู ข้อ 4 ของ db.ts/supabase.ts ข้างบนที่เพิ่ม `isCup: it.isCup` ตอนสร้าง row)

**Step 2 — `src/lib/db.ts` schema + `getRestock` ใน `supabase.ts`/`store-memory.ts`** — เพิ่ม `isCup` เข้า `RestockRow` ตามที่ระบุในข้อ 2/4 ข้างบนแล้ว (ไม่ซ้ำ ระบุลิงก์ไว้ตรงนี้เพื่อ checklist ครบ)

**Step 3 — `src/app/restock/page.tsx` บรรทัด ~503-509** เปลี่ยน label:

โค้ดเดิม:
```tsx
{r.remainG !== undefined ? (
  <span className="w-11 shrink-0 text-right leading-tight">
    <span className="block text-[10.5px] tabular-nums text-brand-ink/60">{r.remain} แพ็ค</span>
    <span className="block text-[9px] tabular-nums text-brand-ink/40">+{r.remainG}g</span>
  </span>
) : (
```

แก้เป็น:
```tsx
{r.remainG !== undefined ? (
  <span className="w-11 shrink-0 text-right leading-tight">
    <span className="block text-[10.5px] tabular-nums text-brand-ink/60">{r.remain} แพ็ค</span>
    <span className="block text-[9px] tabular-nums text-brand-ink/40">
      +{r.remainG}{r.isCup ? " ชิ้น" : "g"}
    </span>
  </span>
) : (
```

(ทางเลือกที่พิจารณาแล้วไม่เลือก: เพิ่ม field ใหม่ `remainUnit: "g" | "pcs"` ใน `RestockRow` แทน `isCup` boolean — คิดว่า `isCup` ตรงไปตรงมากว่าเพราะมี field เดิมชื่อนี้ใน `Item` อยู่แล้ว สื่อความหมายตรงกับต้นเหตุ ไม่ต้องเพิ่มชนิดข้อมูลใหม่)

**Step 4 — `PrintSheet`/CSV export** — ตรวจสอบว่า `PrintRow`/CSV ไม่ได้ print ค่า `remainG` (เช็คแล้ว: `PrintRow = RestockRow & { qty: string }` และตาราง print แสดงแค่ชื่อ/qty/หมายเหตุ ไม่ได้ print remain/remainG เลย — ไม่มีอะไรต้องแก้เพิ่มในส่วนนี้)

---

## 7. Checklist สรุปไฟล์ที่ dev ต้องแก้/เพิ่ม

| ไฟล์ | ทำอะไร |
|---|---|
| `supabase/migrations/0017_restock_selections.sql` | **ใหม่** — สร้างตาราง `restock_selections` |
| `src/lib/types.ts` | เพิ่ม `RestockSelectionEntry`, `RestockSelectionLatestRow`; เพิ่ม `isCup?: boolean` ใน `RestockRow` |
| `src/lib/db.ts` | เพิ่ม `getRestockSelections`, `saveRestockSelections`, `getLatestRestockSelections` |
| `src/lib/supabase.ts` | เพิ่ม 3 methods ข้างบน; แก้ `getRestock` ให้เติม `isCup` |
| `src/lib/store-memory.ts` | เพิ่ม Map `restockSelections` + 3 methods; แก้ `getRestock` ให้เติม `isCup` |
| `src/app/api/restock/selections/route.ts` | **ใหม่** — GET/POST |
| `src/app/api/restock/selections/latest/route.ts` | **ใหม่** — GET |
| `src/lib/seed-data.ts` | เพิ่ม 4 รายการ CUP เข้า `SHOW_REMAINDER_ON_RESTOCK` |
| `src/app/restock/page.tsx` | ลบ `RestockStore`/`store`/`setStore` ที่ยกขึ้น `RestockPage`; `RestockByBranch` hydrate จาก API + ปุ่มบันทึก + gate; `ProductionOrder` ดึง `reflected` จาก API + gate; label CUP remainder |

---

## 8. คำถาม/สมมติฐานที่ต้องถามแพร/PM ต่อ

1. **"ค่าล่าสุด" ของโหมดสั่งผลิต ตัดสินด้วยอะไร** — spec นี้เลือก "แถวที่มี `date` ล่าสุด แล้ว tie-break ด้วย `updated_at` ล่าสุด" ต่อ (สาขา,ไอเทม) เช่น ถ้าสาขา NVP เคย save ไว้สำหรับวันที่ 20/07 และ 22/07 → หน้าสั่งผลิตจะใช้ค่าของ 22/07 เสมอ (ไม่สนว่า save เมื่อไหร่) — อันนี้ตรงกับ "แนวโน้ม" ธุรกิจ (ใช้แผนของรอบล่าสุด) แต่ต่างจากพฤติกรรมเดิมในโค้ด (ที่ใช้ `ts` เวลาที่แก้ล่าสุดจริงๆ ไม่สนวันที่) — ต้องยืนยันว่าตรงกับที่แพรต้องการไหม โดยเฉพาะเคส "แก้ย้อนหลังวันเก่ากว่า" (เช่น เพิ่งนึกได้ว่าลืมกรอกของวันที่ 20 หลังจาก save วันที่ 22 ไปแล้ว) — ค่าที่ 20 จะไม่ทับ 22 ตาม design นี้ (เพราะ 20 < 22) ซึ่งน่าจะถูกต้องแล้ว แต่อยากให้ยืนยัน
2. **ปุ่ม "บันทึกตัวเลือก" กับปุ่ม Export/Print เดิม** — ตอนนี้ export/print ยังทำงานได้โดยไม่ต้องกด "บันทึก" ก่อน (ใช้ค่าจาก local buffer ตรงๆ) เพื่อไม่บังคับ workflow เพิ่ม แต่มีความเสี่ยงพนักงานลืมกด "บันทึก" แล้วของที่ติ๊กไว้ไม่ไปโผล่หน้าสั่งผลิต — ควรบังคับให้ต้อง "บันทึก" ก่อนถึงจะ print/export ได้ไหม หรือปล่อยแบบ optional ตาม spec นี้ (มี hint เตือนเฉยๆ)?
3. **สิทธิ์แก้ย้อนหลัง** — `stock`/`sales` มีกฎ "user แก้ย้อนหลังได้ไม่เกิน 3 วัน" (`assertCanEditDate`) แต่ role ที่เข้าหน้า restock คือ `admin`/`restock` เท่านั้น (ไม่ใช่ `user`) — สมมติฐานคือ **ไม่ต้อง** จำกัดวันที่แก้ย้อนหลังสำหรับ `restock_selections` (เหมือน `GET/POST /api/restock` เดิมที่ไม่มี `assertCanEditDate` เรียกอยู่แล้ว) ถ้าต้องการจำกัดจริงๆ บอกมาจะเพิ่มใน POST handler
4. **Cleanup ข้อมูลเก่า** — `restock_selections` จะโตเรื่อยๆ ตามจำนวน (สาขา×วันที่×ไอเทม) ทุกครั้งที่กด "บันทึก" — เฟสนี้ยังไม่ทำ retention/archive (เหมือน `stock_daily` ที่ก็ไม่มี cleanup เช่นกัน) แค่ตั้ง `.limit(5000)` กันพังใน query ล่าสุดของโหมด B ไว้ก่อน — ถ้าข้อมูลเกิน 5000 แถว selected=true จริงๆ (ไม่น่าเกิดในเร็วๆนี้ ด้วยขนาดร้าน 3 สาขา) ต้องกลับมาเพิ่ม `.gte("date", cutoff)` ภายหลัง
5. **4 รายการ CUP นับเป็น "ต้องเติม" (need) เหมือนเดิมไหม** — spec นี้แก้แค่ label การแสดงผลเศษ (g→ชิ้น) ไม่แตะ logic คำนวณ `need = MAX(par-remain,0)` ของ 4 รายการนี้เลย เพราะไม่ใช่โจทย์ที่ขอ — ยืนยันว่าถูกแล้วใช่ไหมว่าไม่ต้องเปลี่ยน par/need ของ CUP ในเฟสนี้
