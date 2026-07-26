-- ระบบตรวจวันหมดอายุ (แพรยืนยันสเปกครบ 2026-07-26) — รอบตรวจ อังคาร + ศุกร์
-- แนวคิด: ไม่กรอกตอนรับของ (คุมลูกค้าไม่ได้ ไม่ FIFO) → เดินนับของจริงทุกรอบตรวจแทน

-- 1) ตั้งค่าต่อสินค้า — ตัวไหนต้องเช็ค + เตือนล่วงหน้ากี่วัน
--    ขั้นต่ำ 5 วัน เพราะช่วงห่างรอบตรวจสูงสุด 4 วัน (ศุกร์→อังคาร) ถ้าน้อยกว่านี้จะมีของหมดอายุระหว่างรอบ
alter table items add column if not exists expiry_check boolean not null default false;
alter table items add column if not exists expiry_warn_days integer not null default 5;

-- 2) ผลตรวจแต่ละรอบ — 1 แถว = 1 ชุดวันหมดอายุ ของ 1 รายการ (1 รายการมีได้หลายชุด)
create table if not exists expiry_checks (
  id                  bigint generated always as identity primary key,
  branch_id           text not null references branches(id),
  check_date          date not null,               -- วันที่เดินตรวจ
  item_id             text not null references items(id),
  expiry_date         date not null,               -- วันหมดอายุที่เจอบนชั้น
  qty                 numeric not null default 0,  -- นับของจริงตอนตรวจ
  -- null = ยังวางขายต่อ · sell_front = แกะขายหน้าร้าน (ลง used) · return = ส่งคืนครัวกลาง (ลง returned)
  disposition         text check (disposition in ('sell_front', 'return')),
  note                text not null default '',
  created_by_user_id  text,
  created_by_name     text,
  created_at          timestamptz not null default now()
);
create index if not exists idx_expiry_checks_branch_date on expiry_checks (branch_id, check_date);
create index if not exists idx_expiry_checks_date on expiry_checks (check_date desc);
alter table expiry_checks enable row level security;

-- 3) คอลัมน์ติดตามบน stock_daily — แยก "ส่วนที่มาจากผลตรวจวันหมดอายุ" ออกจากที่พนักงานกรอกเอง
--    ใช้แพทเทิร์นเดียวกับ in_auto_pack เพื่อให้บันทึกซ้ำได้โดยไม่บวกซ้ำ (idempotent)
--    เวลาบันทึกผลตรวจ: returned ใหม่ = (returned เดิม − expiry_returned เดิม) + expiry_returned ใหม่
alter table stock_daily add column if not exists expiry_returned numeric not null default 0;
alter table stock_daily add column if not exists expiry_used numeric not null default 0;

-- 4) เปิดใช้กับ 12 รายการที่แพรระบุ — Cereals · Yogurt 500g · โยเกิร์ตถุง
update items set expiry_check = true, expiry_warn_days = 5
where id in (
  'it-026','it-027','it-028','it-113',          -- Cereals
  'it-010','it-011',                             -- Yogurt 500g
  'it-020','it-021','it-022','it-023','it-024','it-025'  -- โยเกิร์ตถุง
);
