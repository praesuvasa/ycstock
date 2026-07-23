-- โน้ตถึงพนักงาน ต่อ (สาขา, วันที่) ของหน้า "รายการสินค้าเข้า" — แพรขอให้บันทึกไว้ตอนกด "บันทึกตัวเลือก"
-- กลับมาเปิดหน้าเดิม (สาขา,วันที่เดิม) ต้องเห็นโน้ตเดิม ไม่ใช่กรอกใหม่ทุกครั้ง
create table if not exists restock_notes (
  branch_id            text not null references branches(id),
  date                 date not null,
  note                 text not null default '',
  updated_by           text,
  updated_by_user_id   text,
  updated_at           timestamptz not null default now(),
  primary key (branch_id, date)
);
alter table restock_notes enable row level security;
