-- ยืนยันรับของ (confirm receipt) — พนักงานสาขาติ๊กรับจริงจากใบ "ต้องเติม" แก้จำนวนได้ถ้าไม่ตรง
-- + เพิ่มรายการนอกใบได้ (is_extra) + auto-fill เข้า stock_daily.in_pack/in_g ของวันที่ติ๊กจริง
-- + คิวตรวจสอบแอดมิน (mismatch / extra / ทับ auto-fill ทีหลัง)

create table restock_receipts (
  id bigint generated always as identity primary key,
  date date not null,               -- วันที่ของใบ (ตรงกับ restock_selections.date)
  branch_id text not null references branches(id),
  item_id text not null references items(id),
  ordered_qty numeric not null default 0,
  received_qty numeric not null,
  received_qty_g numeric not null default 0,
  is_extra boolean not null default false, -- true = เพิ่มนอกใบเดิม ไม่ได้อยู่ใน restock_selections
  confirmed_by_user_id text not null,
  confirmed_by_name text not null,
  confirmed_at timestamptz not null default now(),
  unique (date, branch_id, item_id)
);
alter table restock_receipts enable row level security;

create table stock_admin_flags (
  id bigint generated always as identity primary key,
  branch_id text not null references branches(id),
  date date not null,               -- วันที่สต็อกที่ได้รับผลกระทบ (วันที่ auto-fill ลงจริง)
  item_id text references items(id),
  item_name text not null,
  reason text not null,             -- receipt_mismatch | receipt_extra | stock_override
  detail text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by text
);
alter table stock_admin_flags enable row level security;
create index stock_admin_flags_unresolved_idx on stock_admin_flags (branch_id, created_at) where resolved_at is null;

alter table stock_daily add column in_auto_pack numeric;
alter table stock_daily add column in_auto_g numeric;
