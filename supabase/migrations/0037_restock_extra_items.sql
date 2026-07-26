-- ข้อ 16 (แพรขอ 2026-07-26): ช่องกรอก "รายการที่ไม่มีให้เลือกในระบบ" ของหน้าเติมของ
-- ใช้กรณีต้องส่งของที่ยังไม่ได้ตั้งเป็นสินค้าในระบบ (ของใหม่ / ของยืมชั่วคราว / ของเฉพาะกิจ)
--
-- ตั้งใจให้ "ไม่ผูกกับ items" — ไม่มี item_id เพราะของพวกนี้ยังไม่มีตัวตนในระบบ
-- และ "ไม่ auto-fill รับเข้า" ตามที่แพรระบุ (ไม่เข้าหน้ายืนยันรับของ/ไม่แตะ stock_daily)
-- แต่ต้องเก็บประวัติไว้ดูย้อนหลังได้ว่าเคยส่งอะไรเข้าสาขาไหนเมื่อไหร่ พร้อมหมายเหตุ
--
-- 1 แถว = 1 รายการที่กรอกเอง · บันทึกทับทั้งชุดต่อ (สาขา,วันที่) เหมือน restock_selections
create table if not exists restock_extra_items (
  id                  bigint generated always as identity primary key,
  branch_id           text not null references branches(id),
  date                date not null,
  name                text not null,
  qty                 numeric not null default 0,
  note                text not null default '',
  created_by_user_id  text,
  created_by_name     text,
  created_at          timestamptz not null default now()
);

create index if not exists idx_restock_extra_branch_date on restock_extra_items (branch_id, date);
-- หน้าประวัติ (ดูย้อนหลังทุกสาขา เรียงวันใหม่สุดก่อน)
create index if not exists idx_restock_extra_date on restock_extra_items (date desc);

alter table restock_extra_items enable row level security; -- เข้าถึงผ่าน BFF (service role) เท่านั้น เหมือนตารางอื่น
