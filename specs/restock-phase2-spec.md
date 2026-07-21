# Restock หน้าสั่งผลิต — เฟส 2 Spec (System Analyst)

> ขอบเขต: 2 เรื่อง (ที่จริงเป็นระบบเดียวกัน) — (1) persist "ใบสั่งผลิต" ลง DB จริง แก้ย้อนหลังได้ + มีหน้าประวัติ, (2) ติ๊กคอนเฟิร์ม "ผลิต/รับจริงแล้ว" ทีละรายการ (ต่อ item×branch)
> ห้ามแก้โค้ดจริง — ไฟล์นี้คือ spec ให้ yc-dev ทำต่อ
> อ่านโค้ดอ้างอิงจาก: `specs/restock-phase1-spec.md` (แม่แบบสไตล์), `src/app/restock/page.tsx` (`ProductionOrder`/`ProductionRow`/`ProductionPrintSheet`), `src/lib/types.ts`, `src/lib/db.ts`, `src/lib/supabase.ts`, `src/lib/store-memory.ts`, `src/app/api/restock/selections/route.ts`, `src/app/api/users/route.ts` (แบบ flat route + PATCH ที่ codebase นี้ใช้จริง — **ไม่มี** `[id]` dynamic route folder ที่ไหนในระบบเลย), `src/lib/authz.ts`, `src/lib/audit.ts`, `src/components/nav.tsx`, `src/components/ui/index.tsx`, migrations `0017`/`0019`/`0020`/`0013`/`0014`

---

## 0. สรุป design decision หลัก (อ่านก่อน)

1. **ใบสั่งผลิตหลายใบต่อวันได้ (ไม่ upsert ทับด้วย order_date+delivery_date)** — ทุกครั้งที่กด "บันทึกคำสั่งผลิต" ตอนที่ยังไม่มี id (draft ใหม่) = สร้างแถว `production_orders` ใหม่เสมอ เหตุผล: ใบสั่งผลิตคือ **"เอกสาร"** ที่ต้องคงสภาพย้อนหลังดูได้ (ต่างจาก `restock_selections` เฟส 1 ที่เป็นแค่ "ตัวเลือกล่าสุด" upsert ทับได้ปกติ) และพฤติกรรมจริงมี "สั่งเพิ่มรอบสอง" วันเดียวกันได้ (ลืมกรอกบางอย่าง/มีออเดอร์ฉุกเฉิน) — ถ้า upsert ทับด้วยวันที่ จะทำให้สั่งรอบสองไม่ได้เลย หรือทับข้อมูลรอบแรกหาย
2. **โครงสร้างรายการ = ต่อ (order_id, item_id, branch_key)** — 1 แถว `production_order_items` ต่อ 1 ช่องกรอกในกริดเดิม (item × สาขา หนึ่งในสี่ SND/NVP/KCN/อื่นๆ) ตรงกับที่หน้าปัจจุบันกรอกแยกอยู่แล้ว (`ProductionRow`'s `PROD_FIELDS`) ส่วนรายการพิเศษ (extraRows พิมพ์เอง) เป็นแถวเดี่ยวไม่มีสาขา (`item_id`/`branch_key` เป็น null) ตรงกับ `ExtraRow` เดิมที่ไม่มีแยกสาขาอยู่แล้ว
3. **คอนเฟิร์มเป็นระดับ (item_id, branch_key) หนึ่งแถว = หนึ่งจุดติ๊ก** ตามที่แพรยืนยันแล้วว่าติ๊กทีละรายการ ไม่ใช่ทั้งใบ
4. **แยกฟิลด์ "จำนวนที่สั่ง" (`qty`/`qty_g`) ออกจาก "จำนวนที่รับจริง" (`confirmed_qty`/`confirmed_qty_g`)** — เหตุผลตรงไปตรงมา: โจทย์บอกว่าใช้ "เทียบยอดสั่งกับยอดรับจริง" ถ้าติ๊กคอนเฟิร์มแล้วทับค่า `qty` เดิมทิ้งไปเลย จะไม่เหลือค่า "ที่สั่งไว้ตอนแรก" ให้เทียบอีกต่อไป — ดังนั้น**ต้องมี 2 ฟิลด์แยกกัน** ไม่ใช่แก้ทับ ค่า `confirmed_qty`/`confirmed_qty_g` เป็น `null` แปลว่า "ยังไม่กรอกจำนวนจริง" — ตอนติ๊กคอนเฟิร์ม ถ้า user ไม่แก้อะไร UIจะ default `confirmed_qty = qty` ให้ (กด 1 ทีจบกรณี "ตรงตามสั่งเป๊ะ" ซึ่งเป็นเคสส่วนใหญ่) แต่แก้ตัวเลขได้ก่อน/หลังติ๊กอิสระ (ดูข้อ 5.3)
5. **แก้ไขย้อนหลัง = UPDATE แถวเดิม ไม่ใช่สร้างใบใหม่** — ทั้งแก้ `qty`/`qty_g` (จำนวนที่สั่งพิมพ์ผิด) และแก้สถานะคอนเฟิร์ม/`confirmed_qty` ทำผ่าน PATCH บนแถวเดิม พร้อม `writeAudit` ทุกครั้ง (ดูข้อ 3 ของ API)
6. **ไม่ลบแถว `production_order_items` เมื่อกรอกกลับเป็น 0** — ถ้าแถวนั้นเคย save ไว้แล้ว (มี id) แล้ว user แก้ตัวเลขกลับเป็น 0 ภายหลัง ให้ upsert เป็น `qty=0` (คงแถวไว้) ไม่ลบทิ้ง เพราะอาจมีข้อมูลคอนเฟิร์มติดอยู่แล้ว (กันข้อมูล confirm หาย) — ลบได้เฉพาะรายการพิเศษที่ user กด "✕ ลบ" ชัดเจนเท่านั้น (ผ่าน `removedItemIds`)
7. **auth เหมือนเดิม** `requireAdminOrRestock()` ทั้ง read/write — ไม่มี role ใหม่
8. **ตาม convention เดิมของ codebase นี้: ไม่ใช้ dynamic route `[id]`** — ใช้ query param (`?id=`) สำหรับ GET และ `id` ใน body สำหรับ PATCH (ดูตัวอย่างจริงที่ `src/app/api/users/route.ts`)

---

## 1. Data model — SQL Migration

ไฟล์ใหม่: **`supabase/migrations/0021_production_orders.sql`** (ล่าสุดในระบบตอนนี้คือ `0020_items_variable_yield.sql`)

```sql
-- ใบสั่งผลิต (production_orders) — persist สิ่งที่เดิมเป็น client state ล้วนๆ ใน ProductionOrder component (restock/page.tsx)
-- 1 ครั้งที่กด "บันทึกคำสั่งผลิต" ตอนยังไม่มี id (draft ใหม่) = สร้างใบใหม่ 1 ใบ — ไม่ upsert ทับด้วย order_date+delivery_date
-- เพราะใบสั่งผลิตเป็น "เอกสาร" ต้องคงสภาพย้อนหลังดูได้ + พฤติกรรมจริงมี "สั่งเพิ่มรอบสอง" วันเดียวกัน (ต่างจาก restock_selections ที่เป็นแค่ตัวเลือกล่าสุด)
create table if not exists production_orders (
  id                 bigint generated always as identity primary key,
  order_date         date not null,
  delivery_date      date not null,
  note               text not null default '',
  created_by_user_id text not null default 'system',
  created_by_name    text not null default '',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists idx_production_orders_order_date on production_orders (order_date desc, created_at desc);

-- รายการในใบสั่งผลิต — 1 แถวต่อ (order_id, item_id, branch_key) หนึ่งช่องกรอกในกริดเดิม
-- หรือ 1 แถวต่อ "รายการพิเศษ" (item_id null, extra_name ไม่ null, ไม่มีแยกสาขา — ตรงกับ ExtraRow เดิมที่ไม่แยกสาขาอยู่แล้ว)
-- branch_key เป็น text + check constraint (ไม่ FK ตาราง branches) เพราะมีค่า 'OTHER' ที่ไม่ใช่สาขาจริง (ช่อง "อื่นๆ" ในกริดสั่งผลิตเดิม — ProdField เดิมมี "other")
create table if not exists production_order_items (
  id                    bigint generated always as identity primary key,
  order_id              bigint not null references production_orders(id) on delete cascade,
  item_id               text references items(id),   -- null = รายการพิเศษ (พิมพ์เอง)
  branch_key            text check (branch_key in ('SND','NVP','KCN','OTHER')), -- null สำหรับรายการพิเศษ
  qty                   numeric not null default 0,   -- จำนวนแพ็คที่ "สั่ง" (รายการพิเศษ = จำนวนตามหน่วยที่พิมพ์เอง)
  qty_g                 numeric not null default 0,   -- เศษ g/ชิ้น ที่ไม่เต็มแพ็ค (variableYield items เช่น Yuzu) — 0 เสมอสำหรับรายการพิเศษ
  extra_name            text,    -- ชื่อ ถ้าเป็นรายการพิเศษ
  extra_unit            text,    -- หน่วย ถ้าเป็นรายการพิเศษ
  extra_note            text,    -- หมายเหตุ ถ้าเป็นรายการพิเศษ
  -- ── คอนเฟิร์ม "ผลิต/รับจริงแล้ว" ต่อแถว (item×branch) — แยกจาก qty/qty_g ข้างบนโดยตั้งใจ (ดูข้อ 0.4) ──
  confirmed             boolean not null default false,
  confirmed_qty         numeric,   -- null = ยังไม่กรอกจำนวนจริง/ถือว่าตรงตามสั่ง; ตัวเลข = จำนวนจริงที่ได้ (ถ้าไม่ตรงกับ qty)
  confirmed_qty_g       numeric,
  confirmed_at          timestamptz,
  confirmed_by_user_id  text,
  confirmed_by_name     text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint chk_item_or_extra check (
    (item_id is not null and extra_name is null) or (item_id is null and extra_name is not null)
  )
);
create index if not exists idx_production_order_items_order on production_order_items (order_id);

-- unique เฉพาะแถว "item×branch" ปกติ (ไม่ครอบรายการพิเศษ เพราะรายการพิเศษหลายแถวในใบเดียวกันมี item_id=null ซ้ำกันได้ตามปกติ)
-- ใช้เป็น onConflict key ตอน upsert กริดหลัก (เหมือน restock_selections upsert ด้วย (date,branch_id,item_id))
create unique index if not exists uq_production_order_items_item_branch
  on production_order_items (order_id, item_id, branch_key)
  where item_id is not null;

alter table production_orders      disable row level security; -- แอปเข้าถึงผ่าน BFF (service role) เหมือนตารางอื่นทั้งหมด
alter table production_order_items disable row level security;
```

**หมายเหตุ backward-compat:** ตารางใหม่ล้วนๆ ไม่แตะ `restock_selections`/`stock_daily`/`requisitions`/`items` เลย — deploy migration นี้ก่อน แล้วระบบเดิมทำงานเหมือนเดิมทุกอย่าง (หน้าสั่งผลิตปัจจุบันยังเป็น client state ล้วนๆ) จนกว่าจะ deploy โค้ด BFF/UI ใหม่ที่เรียกตารางนี้

---

## 2. TypeScript types — เพิ่มใน `src/lib/types.ts`

```ts
// ── ใบสั่งผลิต (v1.5) — persist ProductionOrder component จาก client state เดิม ──
// "OTHER" = ช่อง "อื่นๆ" ในกริดสั่งผลิตเดิม (ProdField เดิมมี "other") — ไม่ใช่สาขาจริงจึงแยก type จาก Branch
export type ProdBranchKey = "SND" | "NVP" | "KCN" | "OTHER";

// รายการเดียวในใบสั่งผลิต — 1 แถว = 1 ช่องกรอก (item×branch) หรือ 1 รายการพิเศษ
export interface ProductionOrderItem {
  id: number;                 // production_order_items.id — ใช้ PATCH คอนเฟิร์ม/แก้ทีละแถว
  itemId?: string;            // undefined = รายการพิเศษ
  branch?: ProdBranchKey;     // undefined สำหรับรายการพิเศษ
  qty: number;                // จำนวนที่ "สั่ง"
  qtyG: number;
  extraName?: string;
  extraUnit?: string;
  extraNote?: string;
  confirmed: boolean;
  confirmedQty?: number;      // undefined = ยังไม่กรอกจำนวนจริง — ดูข้อ 0.4
  confirmedQtyG?: number;
  confirmedAt?: string;       // ISO
  confirmedByName?: string;
}

export interface ProductionOrder {
  id: number;
  orderDate: string;
  deliveryDate: string;
  note: string;
  items: ProductionOrderItem[];
  createdByName: string;
  createdAt: string;   // ISO
  updatedAt: string;   // ISO
}

// สรุปย่อ ใช้หน้า list ประวัติ (ไม่ต้องโหลด items ทั้งใบ)
export interface ProductionOrderSummary {
  id: number;
  orderDate: string;
  deliveryDate: string;
  itemCount: number;
  confirmedCount: number;
  note: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

// shape ที่ POST/PATCH ใบส่งขึ้นไป (ไม่มี confirm fields — สร้าง/แก้ "คำสั่ง" เท่านั้น คอนเฟิร์มแยก endpoint)
// id ใส่มาด้วย = อัปเดตแถวเดิม (ใช้ตอน PATCH), ไม่ใส่ id = แถวใหม่ (insert)
export interface ProductionOrderItemInput {
  id?: number;
  itemId?: string;
  branch?: ProdBranchKey;
  qty: number;
  qtyG: number;
  extraName?: string;
  extraUnit?: string;
  extraNote?: string;
}
```

---

## 3. API routes

**แนวทาง 2 route files** — แยก "แก้ทั้งใบ" (header + bulk items จากหน้า compose) ออกจาก "แก้ทีละแถว" (คอนเฟิร์ม/แก้ตัวเลขเดี่ยวๆ จากหน้าประวัติ) เพราะ 2 บริบท UI ต่างกันชัดเจน และกันหน้าประวัติต้องส่ง items ทั้งใบทุกครั้งที่แค่ติ๊ก 1 ช่อง

### 3.1 ไฟล์ใหม่: `src/app/api/production-orders/route.ts`

```
GET /api/production-orders
  → auth: requireAdminOrRestock()
  → query ปกติ (ไม่มี id): list ประวัติ — response { orders: ProductionOrderSummary[] }
    เรียง order_date desc, created_at desc · limit default 50 (query param ?limit= ปรับได้ เหมือน requisitions)
  → query ?id=123: response { order: ProductionOrder } (เต็มพร้อม items) — ไม่พบ → 404 { error }

POST /api/production-orders
  body: { orderDate: string; deliveryDate: string; note?: string; items: ProductionOrderItemInput[] }
  → auth: requireAdminOrRestock()
  → สร้างใบใหม่เสมอ (ไม่เช็ค orderDate ซ้ำ — ดูข้อ 0.1) insert header แล้ว insert items
    (ข้ามแถวที่ qty<=0 && qtyG<=0 ทั้งหมด ยกเว้นรายการพิเศษที่มี extraName ให้ insert เสมอแม้ qty ว่าง — ผู้ใช้ตั้งใจเพิ่มไว้)
  → เขียน audit_log: action="save_production_order", date=orderDate, detail=`สร้างใบสั่งผลิต ${items.length} รายการ (ส่ง ${deliveryDate})`
  → response: { ok: true, order: ProductionOrder }  // คืนเต็มพร้อม id ที่ assign แล้ว ให้ client เก็บไว้ทำ PATCH ต่อ

PATCH /api/production-orders
  body: {
    id: number;
    orderDate?: string; deliveryDate?: string; note?: string;
    items?: ProductionOrderItemInput[];   // full snapshot ของ "กริดหลัก" ตอนนี้ (ไม่ใช่ diff) — ดูกติกา upsert ข้อ 4
    removedItemIds?: number[];            // เฉพาะรายการพิเศษที่ user กด "✕ ลบ" ชัดเจน
  }
  → auth: requireAdminOrRestock()
  → แก้ header เฉพาะฟิลด์ที่ส่งมา + set updated_at=now()
  → ถ้ามี items: upsert ตามกติกาข้อ 4 (ไม่แตะ confirmed/confirmed_qty ของแถวเดิม)
  → ถ้ามี removedItemIds: ลบเฉพาะแถวที่ item_id is null (กันลบแถวกริดหลักผิดพลาดจาก endpoint นี้)
  → เขียน audit_log: action="edit_production_order", date=orderDate ปัจจุบัน, detail=`แก้ไขใบสั่งผลิต #${id}`
  → response: { ok: true, order: ProductionOrder }  // คืนเต็มหลังแก้ไข ให้ client sync state ตรง DB เป๊ะ
```

### 3.2 ไฟล์ใหม่: `src/app/api/production-orders/items/route.ts`

```
PATCH /api/production-orders/items
  body: {
    id: number;              // production_order_items.id
    qty?: number; qtyG?: number;                 // แก้ "จำนวนที่สั่ง" ย้อนหลัง (พิมพ์ผิดตอนแรก)
    confirmed?: boolean;                          // ติ๊ก/ถอนติ๊ก คอนเฟิร์ม
    confirmedQty?: number; confirmedQtyG?: number; // จำนวนจริงที่ได้ ถ้าไม่ตรงกับที่สั่ง
  }
  → auth: requireAdminOrRestock()
  → หาแถวจาก id ก่อน — ไม่พบ → 404
  → ถ้า confirmed === true และ request ไม่ได้ส่ง confirmedQty/confirmedQtyG มาด้วย และแถวยังไม่เคยมีค่านี้มาก่อน
    → default confirmed_qty = qty ปัจจุบันของแถว, confirmed_qty_g = qty_g ปัจจุบัน (กด "รับแล้ว" ทีเดียวจบกรณีตรงตามสั่ง)
  → set confirmed_at=now(), confirmed_by_user_id/name=session เฉพาะตอน confirmed เปลี่ยนจาก false→true
  → ถอนติ๊ก (confirmed:false ส่งมา) → set confirmed=false เท่านั้น ไม่ล้าง confirmed_qty/confirmed_at/by (เก็บเป็นข้อมูลร่างล่าสุดไว้ กดติ๊กใหม่ได้โดยไม่ต้องกรอกซ้ำ — ดูคำถามข้อ 7)
  → เขียน audit_log: ถ้า confirmed อยู่ใน body → action="confirm_production_item"; ไม่งั้น (แก้แค่ qty/qtyG) → action="edit_production_order"
    detail=`${item name หรือ extraName} · ${branch}` (join กับชื่อ item ต้อง lookup จาก meta — หรือส่ง itemName/branch มาจาก client ใน body เพื่อลดการ query ซ้ำ ก็ได้ แนะนำแบบหลัง เพราะ client มีอยู่แล้วในตอนแสดงผล)
  → response: { ok: true, item: ProductionOrderItem }
```

รูปแบบ error response ทั้งคู่ตาม pattern เดิมทุก route ในระบบ (`{ error: string }` + status จาก `authErrorResponse`/400/404/500)

---

## 4. กติกา upsert ของ `items` ใน `PATCH /api/production-orders` (สำคัญ — อ่านก่อนเขียน `db.ts`)

แบ่ง 2 กลุ่ม ประมวลผลต่างกัน:

**(ก) แถวกริดหลัก (`itemId` มีค่า, `branch` มีค่า)** — upsert บน unique key `(order_id, item_id, branch_key)`:
```ts
// payload ไม่ใส่ confirmed/confirmed_qty/confirmed_qty_g/confirmed_at เลย
// → ตอน conflict (แถวเดิมมีอยู่) supabase-js upsert() จะ SET เฉพาะคอลัมน์ที่ส่งมา คอลัมน์ confirm ฝั่ง DB ไม่ถูกแตะ (คงค่าเดิม)
// → ตอน insert ใหม่ (แถวยังไม่เคยมี) confirmed คอลัมน์ default เป็น false ตาม schema อยู่แล้ว
const gridPayload = items
  .filter(i => i.itemId && i.branch)
  .filter(i => i.qty > 0 || i.qtyG > 0 || existingIds.has(keyOf(i.itemId, i.branch))) // ดูข้อ 0.6 — เคย save แล้วแม้เป็น 0 ก็ยัง upsert (ไม่ข้าม)
  .map(i => ({ order_id: id, item_id: i.itemId, branch_key: i.branch, qty: i.qty, qty_g: i.qtyG, updated_at: now }));
await sb().from("production_order_items").upsert(gridPayload, { onConflict: "order_id,item_id,branch_key" });
```

**(ข) รายการพิเศษ (`itemId` ไม่มีค่า, `extraName` มีค่า)** — ไม่มี natural key ให้ onConflict (item_id/branch_key เป็น null ซ้ำกันได้หลายแถว) → แยก insert/update ด้วย `id`:
```ts
for (const row of items.filter(i => !i.itemId)) {
  if (row.id) {
    await sb().from("production_order_items").update({
      qty: row.qty, qty_g: row.qtyG,
      extra_name: row.extraName, extra_unit: row.extraUnit, extra_note: row.extraNote,
      updated_at: now,
    }).eq("id", row.id).eq("order_id", id);   // .eq("order_id", id) กันแก้ข้ามใบผิด
  } else {
    await sb().from("production_order_items").insert({
      order_id: id, item_id: null, branch_key: null,
      qty: row.qty, qty_g: row.qtyG,
      extra_name: row.extraName, extra_unit: row.extraUnit, extra_note: row.extraNote,
    });
  }
}
if (removedItemIds?.length) {
  await sb().from("production_order_items").delete()
    .in("id", removedItemIds).eq("order_id", id).is("item_id", null); // กันลบแถวกริดหลักผิด
}
```

`existingIds` ในข้อ (ก) มาจาก query แถวเดิมของใบนี้ก่อนเริ่ม upsert (`select id,item_id,branch_key where order_id=id and item_id is not null`) — ทำ set ของ `item_id|branch_key` เดิมไว้เทียบ

---

## 5. `db.ts` / `supabase.ts` / `store-memory.ts` — methods ที่ต้องเพิ่ม

### `src/lib/db.ts` (เพิ่มต่อท้าย object `db`)

```ts
// ── ใบสั่งผลิต (v1.5) ──
listProductionOrders: (limit?: number): Promise<ProductionOrderSummary[]> =>
  useSupabase ? supabaseStore.listProductionOrders(limit) : Promise.resolve(memoryStore.listProductionOrders(limit)),

getProductionOrder: (id: number): Promise<ProductionOrder | null> =>
  useSupabase ? supabaseStore.getProductionOrder(id) : Promise.resolve(memoryStore.getProductionOrder(id)),

createProductionOrder: (
  input: { orderDate: string; deliveryDate: string; note: string; items: ProductionOrderItemInput[] },
  userId: string, userName: string
): Promise<ProductionOrder> =>
  useSupabase
    ? supabaseStore.createProductionOrder(input, userId, userName)
    : Promise.resolve(memoryStore.createProductionOrder(input, userId, userName)),

updateProductionOrder: (
  id: number,
  patch: { orderDate?: string; deliveryDate?: string; note?: string; items?: ProductionOrderItemInput[]; removedItemIds?: number[] }
): Promise<ProductionOrder | null> =>
  useSupabase ? supabaseStore.updateProductionOrder(id, patch) : Promise.resolve(memoryStore.updateProductionOrder(id, patch)),

updateProductionOrderItem: (
  id: number,
  patch: { qty?: number; qtyG?: number; confirmed?: boolean; confirmedQty?: number; confirmedQtyG?: number },
  userId: string, userName: string
): Promise<ProductionOrderItem | null> =>
  useSupabase
    ? supabaseStore.updateProductionOrderItem(id, patch, userId, userName)
    : Promise.resolve(memoryStore.updateProductionOrderItem(id, patch, userId, userName)),
```

(import `ProductionOrder`, `ProductionOrderSummary`, `ProductionOrderItem`, `ProductionOrderItemInput` เพิ่มที่หัวไฟล์)

### `src/lib/supabase.ts` (เพิ่มใน `supabaseStore`, ก่อน `// ── audit ──`)

หลักการ: `getProductionOrder`/`listProductionOrders` map แถว DB (snake_case) → `ProductionOrder`/`ProductionOrderItem` (camelCase) เหมือนที่ `rowFromDb`/`rowFromReqDb` ทำอยู่แล้วท้ายไฟล์ — เขียน helper `rowFromProdOrderItemDb(r)` และ `rowFromProdOrderDb(header, items)` เพิ่ม

```ts
// ── ใบสั่งผลิต (v1.5) ──
async listProductionOrders(limit = 50): Promise<ProductionOrderSummary[]> {
  const { data, error } = await sb().from("production_orders")
    .select("id,order_date,delivery_date,note,created_by_name,created_at,updated_at")
    .order("order_date", { ascending: false }).order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  const orders = data ?? [];
  if (orders.length === 0) return [];
  const ids = orders.map((o: any) => o.id);
  const { data: itemRows, error: e2 } = await sb().from("production_order_items")
    .select("order_id,confirmed").in("order_id", ids);
  if (e2) throw e2;
  const counts = new Map<number, { total: number; confirmed: number }>();
  for (const r of itemRows ?? []) {
    const c = counts.get(r.order_id) ?? { total: 0, confirmed: 0 };
    c.total++; if (r.confirmed) c.confirmed++;
    counts.set(r.order_id, c);
  }
  return orders.map((o: any) => ({
    id: o.id, orderDate: o.order_date, deliveryDate: o.delivery_date, note: o.note ?? "",
    itemCount: counts.get(o.id)?.total ?? 0, confirmedCount: counts.get(o.id)?.confirmed ?? 0,
    createdByName: o.created_by_name, createdAt: o.created_at, updatedAt: o.updated_at,
  }));
},

async getProductionOrder(id: number): Promise<ProductionOrder | null> {
  const { data: header, error } = await sb().from("production_orders").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!header) return null;
  const { data: items, error: e2 } = await sb().from("production_order_items")
    .select("*").eq("order_id", id).order("id");
  if (e2) throw e2;
  return rowFromProdOrderDb(header, items ?? []);
},

async createProductionOrder(
  input: { orderDate: string; deliveryDate: string; note: string; items: ProductionOrderItemInput[] },
  userId: string, userName: string
): Promise<ProductionOrder> {
  const { data: header, error } = await sb().from("production_orders").insert({
    order_date: input.orderDate, delivery_date: input.deliveryDate, note: input.note ?? "",
    created_by_user_id: userId, created_by_name: userName,
  }).select().single();
  if (error) throw error;
  const rows = input.items
    .filter((i) => (i.itemId && i.branch) ? (i.qty > 0 || i.qtyG > 0) : !!i.extraName)
    .map((i) => ({
      order_id: header.id, item_id: i.itemId ?? null, branch_key: i.itemId ? i.branch : null,
      qty: i.qty, qty_g: i.qtyG,
      extra_name: i.extraName ?? null, extra_unit: i.extraUnit ?? null, extra_note: i.extraNote ?? null,
    }));
  let items: any[] = [];
  if (rows.length > 0) {
    const { data, error: e2 } = await sb().from("production_order_items").insert(rows).select();
    if (e2) throw e2;
    items = data ?? [];
  }
  return rowFromProdOrderDb(header, items);
},

async updateProductionOrder(
  id: number,
  patch: { orderDate?: string; deliveryDate?: string; note?: string; items?: ProductionOrderItemInput[]; removedItemIds?: number[] }
): Promise<ProductionOrder | null> {
  const headerPatch: any = { updated_at: new Date().toISOString() };
  if (patch.orderDate !== undefined) headerPatch.order_date = patch.orderDate;
  if (patch.deliveryDate !== undefined) headerPatch.delivery_date = patch.deliveryDate;
  if (patch.note !== undefined) headerPatch.note = patch.note;
  const { error } = await sb().from("production_orders").update(headerPatch).eq("id", id);
  if (error) throw error;

  if (patch.items) {
    const { data: existing } = await sb().from("production_order_items")
      .select("item_id,branch_key").eq("order_id", id).not("item_id", "is", null);
    const existingKeys = new Set((existing ?? []).map((r: any) => r.item_id + "|" + r.branch_key));
    const now = new Date().toISOString();

    const gridRows = patch.items
      .filter((i) => i.itemId && i.branch)
      .filter((i) => i.qty > 0 || i.qtyG > 0 || existingKeys.has(i.itemId + "|" + i.branch))
      .map((i) => ({ order_id: id, item_id: i.itemId, branch_key: i.branch, qty: i.qty, qty_g: i.qtyG, updated_at: now }));
    if (gridRows.length > 0) {
      const { error: e2 } = await sb().from("production_order_items")
        .upsert(gridRows, { onConflict: "order_id,item_id,branch_key" });
      if (e2) throw e2;
    }

    for (const row of patch.items.filter((i) => !i.itemId)) {
      if (row.id) {
        const { error: e3 } = await sb().from("production_order_items").update({
          qty: row.qty, qty_g: row.qtyG,
          extra_name: row.extraName ?? null, extra_unit: row.extraUnit ?? null, extra_note: row.extraNote ?? null,
          updated_at: now,
        }).eq("id", row.id).eq("order_id", id);
        if (e3) throw e3;
      } else if (row.extraName) {
        const { error: e4 } = await sb().from("production_order_items").insert({
          order_id: id, item_id: null, branch_key: null, qty: row.qty, qty_g: row.qtyG,
          extra_name: row.extraName, extra_unit: row.extraUnit ?? null, extra_note: row.extraNote ?? null,
        });
        if (e4) throw e4;
      }
    }
  }
  if (patch.removedItemIds?.length) {
    const { error: e5 } = await sb().from("production_order_items").delete()
      .in("id", patch.removedItemIds).eq("order_id", id).is("item_id", null);
    if (e5) throw e5;
  }
  return this.getProductionOrder(id);
},

async updateProductionOrderItem(
  id: number,
  patch: { qty?: number; qtyG?: number; confirmed?: boolean; confirmedQty?: number; confirmedQtyG?: number },
  userId: string, userName: string
): Promise<ProductionOrderItem | null> {
  const { data: cur } = await sb().from("production_order_items").select("*").eq("id", id).maybeSingle();
  if (!cur) return null;
  const upd: any = { updated_at: new Date().toISOString() };
  if (patch.qty !== undefined) upd.qty = patch.qty;
  if (patch.qtyG !== undefined) upd.qty_g = patch.qtyG;
  if (patch.confirmed !== undefined) {
    upd.confirmed = patch.confirmed;
    if (patch.confirmed && !cur.confirmed) {
      upd.confirmed_at = new Date().toISOString();
      upd.confirmed_by_user_id = userId;
      upd.confirmed_by_name = userName;
      // default confirmed_qty = qty ปัจจุบัน ถ้า client ไม่ได้ส่งมาเอง และยังไม่เคยมีค่านี้ (ดูข้อ 0.4)
      if (patch.confirmedQty === undefined && cur.confirmed_qty == null) upd.confirmed_qty = patch.qty ?? cur.qty;
      if (patch.confirmedQtyG === undefined && cur.confirmed_qty_g == null) upd.confirmed_qty_g = patch.qtyG ?? cur.qty_g;
    }
  }
  if (patch.confirmedQty !== undefined) upd.confirmed_qty = patch.confirmedQty;
  if (patch.confirmedQtyG !== undefined) upd.confirmed_qty_g = patch.confirmedQtyG;
  const { data, error } = await sb().from("production_order_items").update(upd).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return data ? rowFromProdOrderItemDb(data) : null;
},
```

Helper ท้ายไฟล์ (ใกล้ `rowFromDb`/`rowFromReqDb`):
```ts
function rowFromProdOrderItemDb(r: any): ProductionOrderItem {
  return {
    id: r.id, itemId: r.item_id ?? undefined, branch: r.branch_key ?? undefined,
    qty: Number(r.qty), qtyG: Number(r.qty_g),
    extraName: r.extra_name ?? undefined, extraUnit: r.extra_unit ?? undefined, extraNote: r.extra_note ?? undefined,
    confirmed: r.confirmed, confirmedQty: r.confirmed_qty ?? undefined, confirmedQtyG: r.confirmed_qty_g ?? undefined,
    confirmedAt: r.confirmed_at ?? undefined, confirmedByName: r.confirmed_by_name ?? undefined,
  };
}
function rowFromProdOrderDb(h: any, items: any[]): ProductionOrder {
  return {
    id: h.id, orderDate: h.order_date, deliveryDate: h.delivery_date, note: h.note ?? "",
    items: items.map(rowFromProdOrderItemDb),
    createdByName: h.created_by_name, createdAt: h.created_at, updatedAt: h.updated_at,
  };
}
```

### `src/lib/store-memory.ts` (เพิ่ม Maps + methods — เหมือนเดิม in-memory เก็บลำดับ id เอง)

```ts
interface ProductionOrderRec {
  id: number; orderDate: string; deliveryDate: string; note: string;
  createdByUserId: string; createdByName: string; createdAt: string; updatedAt: string;
}
interface ProductionOrderItemRec {
  id: number; orderId: number; itemId?: string; branch?: ProdBranchKey;
  qty: number; qtyG: number; extraName?: string; extraUnit?: string; extraNote?: string;
  confirmed: boolean; confirmedQty?: number; confirmedQtyG?: number;
  confirmedAt?: string; confirmedByUserId?: string; confirmedByName?: string;
  createdAt: string; updatedAt: string;
}
const productionOrders = new Map<number, ProductionOrderRec>();
const productionOrderItems = new Map<number, ProductionOrderItemRec>();
let prodOrderSeq = 1, prodItemSeq = 1;
```

Methods (ตรรกะเดียวกับฝั่ง supabase แต่ทำงานบน Map — filter ตาม `orderId`, upsert = หา rec ที่ `itemId+branch+orderId` ตรงแล้วแก้ทับ/ไม่เจอก็สร้างใหม่, ข้าม logic partial-unique-index เพราะ memory เดินลูป filter ตรงๆ ได้เลย) — เพิ่มก่อน `// ── audit ──`

---

## 6. UI flow — `src/app/restock/page.tsx`

### 6.1 เพิ่มโหมดที่ 3 ใน mode toggle เดิม

```ts
type Mode = "byBranch" | "production" | "productionHistory";
const MODE_OPTS = [
  { value: "byBranch" as Mode, label: "📦 ต้องเติมรายสาขา" },
  { value: "production" as Mode, label: "🏭 สั่งผลิต" },
  { value: "productionHistory" as Mode, label: "🗂️ ประวัติสั่งผลิต" },
];
```
เลือกวิธีนี้ (3 ปุ่มในหน้าเดิม) แทนการเพิ่ม nav tab ใหม่ เพราะ `RESTOCK_TABS`/`ADMIN_TABS` ใน `nav.tsx` ตอนนี้มีรายการ `/restock` เดียวคุมทั้ง 2 โหมดอยู่แล้ว (สอดคล้อง pattern เดิม ไม่ต้องแก้ nav.tsx เลย) — ทางเลือกอื่น (เพิ่ม route `/restock/history` แยก) ก็ทำได้แต่ต้องแก้ `nav.tsx` เพิ่ม badge/active state ซับซ้อนกว่าโดยไม่ได้ประโยชน์ชัดเจน

`RestockPage` (บรรทัด 267-282 เดิม): เพิ่ม state `editOrderId: number | null` — ส่งเป็น prop ให้ `ProductionOrder` ตอนกด "แก้ไขใบนี้" จากหน้าประวัติ (ดูข้อ 6.3) แล้วสลับ mode เป็น `"production"` ให้อัตโนมัติ

### 6.2 `ProductionOrder` — เปลี่ยนจาก pure client state → bind กับ DB record

รับ prop ใหม่: `{ editOrderId, onSaved }: { editOrderId: number | null; onSaved: (id: number) => void }`

**State เพิ่ม:**
```ts
const [orderId, setOrderId] = React.useState<number | null>(null);
const [savedItemIds, setSavedItemIds] = React.useState<Record<string, number>>({}); // key = `${itemId}|${branch}` หรือ extraRow.id → server id
const [dirty, setDirty] = React.useState(false);       // binary พอ (ไม่ทำ per-field status ละเอียดแบบเฟส 1 — จำนวนช่องเยอะกว่ามาก ไม่คุ้มความซับซ้อน)
const [saving, setSaving] = React.useState(false);
const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
```

**โหมดแก้ไขใบเก่า (`editOrderId != null`):**
- แทนที่จะยิง `Promise.all([meta, selections/latest×3branch])` แบบเดิมทั้งหมด → เพิ่ม `GET /api/production-orders?id=${editOrderId}` ขนานไปด้วย
- Hydrate: `orderId=order.id`, `orderDate=order.orderDate`, `deliveryDate=order.deliveryDate`, `note=order.note`, แปลง `order.items` กลับเป็น `prodQty`/`prodQtyG`/`extraRows` ตาม shape เดิม (grid items → `prodQty[itemId][branch]=String(qty)`, extra items → `extraRows` array), เก็บ `savedItemIds` จาก `item.id` ของแต่ละแถว
- **ข้าม reflected pre-fill ทั้งหมด** (ไม่ fetch `/api/restock/selections` 3 สาขา) — ค่าที่โหลดจาก order ที่บันทึกไว้คือความจริงของใบนี้ ไม่ควรถูกค่าจาก restock ปัจจุบันมาปน (คนละบริบทเวลา)
- **ข้าม date-confirm gate** (`useConfirmGate`) — วันที่ของใบนี้ fix อยู่แล้วจากตอนสร้าง ไม่ใช่ "เริ่มกรอกใหม่" ที่ gate ป้องกันไว้

**โหมดสร้างใหม่ (`editOrderId == null`, ค่าเริ่มต้น):** พฤติกรรมเดิมทุกอย่าง (fetch meta + reflected 3 สาขา + gate) — `orderId` เริ่มที่ `null`

**`handleSave()`:**
```ts
async function handleSave() {
  setSaving(true);
  try {
    const items = buildItemsPayload(); // รวม prodQty/prodQtyG (grid, ใส่ id จาก savedItemIds ถ้ามี) + extraRows (ใส่ id ถ้ามี)
    if (orderId == null) {
      const res = await fetch("/api/production-orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderDate, deliveryDate, note, items }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      setOrderId(data.order.id);
      syncSavedItemIds(data.order.items);
      onSaved(data.order.id);
    } else {
      const removedItemIds = extraRowsRemovedSinceLoad; // track ตอน removeExtraRow ถ้าแถวนั้นมี server id อยู่แล้ว
      const res = await fetch("/api/production-orders", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, orderDate, deliveryDate, note, items, removedItemIds }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "บันทึกไม่สำเร็จ");
      syncSavedItemIds(data.order.items);
    }
    setDirty(false);
    setLastSavedAt(new Date());
  } catch (e: any) {
    window.alert(`บันทึกไม่สำเร็จ: ${e?.message ?? e}`);
  } finally {
    setSaving(false);
  }
}
```
`dirty` set เป็น `true` ใน `setProd`/`setProdG`/`patchExtraRow`/`addExtraRow`/`removeExtraRow`/`setNote`/`setOrderDate`/`setDeliveryDate` ทุกจุด (onChange handler เดิมเติมท้ายบรรทัดเดียว)

**ปุ่ม/UI เพิ่ม** (แทนที่แถบ export/print เดิมบรรทัด 1306-1321, เพิ่ม `SaveBar` เหนือมัน เหมือน pattern โหมด A เฟส 1):
```tsx
<SaveBar>
  {dirty ? (
    <p className="mb-2 ... text-warn">⚠️ มีการแก้ไขยังไม่บันทึก</p>
  ) : lastSavedAt ? (
    <p className="mb-2 ... text-ok">✓ บันทึกล่าสุด {formatTime(lastSavedAt)} น. — ใบ #{orderId}</p>
  ) : null}
  <Button onClick={handleSave} disabled={saving}>
    {saving ? "กำลังบันทึก…" : orderId == null ? "💾 บันทึกคำสั่งผลิต" : "💾 บันทึกการแก้ไข"}
  </Button>
</SaveBar>
```
Export CSV/พิมพ์ ยังทำงานได้โดยไม่ต้อง save ก่อนเหมือนโหมด A เฟส 1 (ใช้ค่าจาก local buffer ตรงๆ)

### 6.3 หน้าใหม่ `ProductionHistory` (mode `"productionHistory"`)

โครงสร้าง 2 ระดับ (list → detail) คล้าย pattern `Accordion`/`GlassCard` ที่มีอยู่แล้วทั้งระบบ ไม่ต้องมี component ใหม่นอก convention เดิม:

**List view** (ค่าเริ่มต้น):
```
GET /api/production-orders → orders: ProductionOrderSummary[]
render แต่ละใบเป็น GlassCard กดได้ (หรือใช้ Accordion ตรงๆ):
  หัวข้อ: "สั่งผลิต {thaiDateSlash(orderDate)} → ส่ง {thaiDateSlash(deliveryDate)}"
  บรรทัดรอง: "{itemCount} รายการ · คอนเฟิร์มแล้ว {confirmedCount}/{itemCount} · โดย {createdByName}"
  Badge สี ok ถ้า confirmedCount === itemCount, สี warn ถ้า confirmedCount === 0, สี neutral ถ้าคาบเกี่ยว (บางส่วน)
  คลิก → setSelectedOrderId(order.id) เปิด detail view (แทนที่ list หรือ expand inline ก็ได้ แนะนำแทนที่ list + ปุ่ม "← กลับ" เพราะ detail มีเนื้อหาเยอะ)
```

**Detail view** (`selectedOrderId != null`):
```
GET /api/production-orders?id=${selectedOrderId} → order: ProductionOrder
หัวการ์ด: วันที่สั่ง/ส่ง + หมายเหตุ + ปุ่ม "✏️ แก้ไขใบนี้" (→ props.onEdit(order.id) ที่ RestockPage สลับ mode="production" + editOrderId=order.id ตามข้อ 6.1)

จัดกลุ่มรายการเหมือนกริดสั่งผลิตเดิม (category, dept2, รายการพิเศษแยกท้าย) — แต่ละแถว "ConfirmRow":
  ชื่อรายการ + 4 คอลัมน์ (SND/NVP/KCN/อื่นๆ) หรือ 1 แถวเดี่ยว (รายการพิเศษ)
  แต่ละคอลัมน์ที่มี qty>0 หรือ qtyG>0: โชว์ "จำนวนที่สั่ง" (read-only, ข้อความ formatOrderQty เดิม) +
    checkbox เล็กใต้ตัวเลข "☐ รับแล้ว" ผูกกับ item.confirmed
    ถ้า confirmed=true → โชว์ badge ok เล็กๆ + ถ้า confirmedQty/confirmedQtyG ต่างจาก qty/qtyG → โชว์ตัวแดงเตือน "ได้จริง {confirmedQty}" ใต้ checkbox (ไม่ตรงตามสั่ง เห็นชัดทันที)
    ลิงก์เล็ก "แก้จำนวนจริง" (ซ่อนโดย default) → เปิด input ให้กรอก confirmedQty/confirmedQtyG ก่อน/หลังติ๊กก็ได้ อิสระจากสถานะ confirmed

onToggleConfirm(itemRowId, next: boolean):
  optimistic update local state ก่อน (responsive) → PATCH /api/production-orders/items { id: itemRowId, confirmed: next }
  → ล้มเหลว rollback + window.alert เหมือน pattern handleSave อื่นในระบบ

onEditConfirmedQty(itemRowId, confirmedQty, confirmedQtyG):
  PATCH /api/production-orders/items { id: itemRowId, confirmedQty, confirmedQtyG }
```

**Mobile-first:** ทุก element ใช้ `glass-soft`/`GlassCard`/`Badge`/`Accordion` ที่มีอยู่แล้ว (`src/components/ui/index.tsx`) — ไม่ต้องสร้าง component ใหม่นอกชุดนี้ ยกเว้น `ConfirmRow` (local component ในไฟล์เดียวกับ `ProductionRow` เดิม ใช้โครง 4-column grid แบบเดียวกันเพื่อความคุ้นตา)

---

## 7. Migration backward-compat

ตารางใหม่ล้วนๆ (`production_orders`, `production_order_items`) ไม่แก้ตารางเดิมเลยแม้แต่คอลัมน์เดียว — deploy migration ก่อน code ได้อย่างปลอดภัยเหมือนทุกเฟสที่ผ่านมา ระบบเดิม (`restock_selections` เฟส 1, `ProductionOrder` client-state เดิม) ทำงานต่อได้ปกติจนกว่าจะ deploy โค้ด BFF/UI ใหม่

---

## 8. Checklist สรุปไฟล์ที่ dev ต้องแก้/เพิ่ม

| ไฟล์ | ทำอะไร |
|---|---|
| `supabase/migrations/0021_production_orders.sql` | **ใหม่** — สร้างตาราง `production_orders`, `production_order_items` |
| `src/lib/types.ts` | เพิ่ม `ProdBranchKey`, `ProductionOrderItem`, `ProductionOrder`, `ProductionOrderSummary`, `ProductionOrderItemInput` |
| `src/lib/db.ts` | เพิ่ม `listProductionOrders`, `getProductionOrder`, `createProductionOrder`, `updateProductionOrder`, `updateProductionOrderItem` |
| `src/lib/supabase.ts` | เพิ่ม 5 methods ข้างบน + helper `rowFromProdOrderItemDb`/`rowFromProdOrderDb` |
| `src/lib/store-memory.ts` | เพิ่ม Maps `productionOrders`/`productionOrderItems` + 5 methods (logic เดียวกัน ทำงานบน Map) |
| `src/app/api/production-orders/route.ts` | **ใหม่** — GET (list/single), POST, PATCH |
| `src/app/api/production-orders/items/route.ts` | **ใหม่** — PATCH (คอนเฟิร์ม/แก้ทีละแถว) |
| `src/app/restock/page.tsx` | เพิ่ม mode `"productionHistory"`; `ProductionOrder` bind กับ DB (orderId/savedItemIds/dirty/handleSave/skip reflected+gate ตอนแก้ไข); component ใหม่ `ProductionHistory` + `ConfirmRow` |

ไม่ต้องแก้ `nav.tsx` (mode ใหม่อยู่ใน toggle เดิมของหน้า `/restock`)

---

## 9. คำถาม/สมมติฐานที่ต้องถามแพร/PM ต่อ

1. **หลายใบต่อวันได้จริงไหม** — spec นี้ตัดสินใจว่า "บันทึก" แต่ละครั้ง (ตอนยังไม่มี id) = สร้างใบใหม่เสมอ ไม่ผูกกับ (orderDate,deliveryDate) แบบ unique — เท่ากับสั่งผลิตวันเดียวกัน 2 รอบได้ 2 ใบแยกกัน (ไม่ merge) ถ้าแพรต้องการ "1 วัน = 1 ใบเสมอ" (สั่งรอบสองต้องไปแก้ใบเดิมแทน ไม่ใช่สร้างใบใหม่) ต้องปรับ POST ให้เช็ค/บล็อกหรือ redirect ไปแก้ใบเดิมแทน
2. **คอนเฟิร์มทำได้จากหน้าไหนบ้าง** — spec นี้ให้คอนเฟิร์ม (ติ๊ก+แก้จำนวนจริง) อยู่เฉพาะหน้า "ประวัติสั่งผลิต" (detail view) เท่านั้น ไม่ทำที่หน้า compose (`ProductionOrder`) เพราะมองว่าคอนเฟิร์มเกิด "หลัง" ผลิต/ส่งของจริงแล้ว คนละช่วงเวลากับตอนกรอกสั่ง — ถ้าแพรอยากให้ติ๊กคอนเฟิร์มได้จากหน้า compose เลย (เช่น กรณีสั่ง+รับพร้อมกันในการเข้าครั้งเดียว) ต้องเพิ่ม UI ตรงนั้นด้วย
3. **ถอนติ๊กคอนเฟิร์มแล้วข้อมูล `confirmed_qty`/`confirmed_at` หายไหม** — spec นี้เลือก "เก็บไว้" (ถอนติ๊กแค่ปิด flag `confirmed`) เพื่อกดติ๊กใหม่ได้โดยไม่ต้องกรอกซ้ำ ถ้าต้องการให้ถอนติ๊ก = ล้างข้อมูลจริงให้ตอบยืนยัน
4. **`confirmedQty` ต้องเด่นแค่ไหนใน UI** — เสนอเป็น "ซ่อนโดย default, มีลิงก์เล็กๆ ให้กดแก้เมื่อไม่ตรง" (กันหน้ารกกรณีส่วนใหญ่ตรงตามสั่ง 100%) ถ้าแพรอยากให้เห็น/กรอกได้ทันทีทุกแถวโดยไม่ต้องกดเปิดก่อน บอกมาปรับ UI ได้
5. **Retention/archive** — ตารางใหม่โตเรื่อยๆ ตามจำนวนใบสั่งผลิต×รายการ เฟสนี้ยังไม่ทำ cleanup (ท่าเดียวกับ `stock_daily`/`restock_selections` เดิมที่ก็ไม่มี) — ยืนยันว่ายังไม่ต้องกังวลระยะนี้ (ขนาดร้าน 3 สาขา ไม่น่าโตเร็ว)
6. **แก้ไขใบเก่ามาก (`orderDate` ย้อนหลังนานๆ)** — สมมติฐานคือ **ไม่จำกัด** วันที่แก้ย้อนหลัง (เหมือนโหมด A เฟส 1 ที่ role restock/admin ไม่ผ่าน `assertCanEditDate`) ถ้าต้องการจำกัดจริงๆ (เช่น แก้ได้แค่ 7 วันย้อนหลัง) บอกมาจะเพิ่มเงื่อนไขใน PATCH
