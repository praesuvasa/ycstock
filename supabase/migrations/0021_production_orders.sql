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
  -- ── คอนเฟิร์ม "ผลิต/รับจริงแล้ว" ต่อแถว (item×branch) — แยกจาก qty/qty_g ข้างบนโดยตั้งใจ (ดูข้อ 0.4 ของ spec) ──
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
