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
