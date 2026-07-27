-- กันบันทึกทับกันเมื่อพนักงาน 2 คนกรอกสต็อกวันเดียวกันพร้อมกัน (v1.14)
--
-- ปัญหาเดิม: stock_daily upsert แบบ last-write-wins ทั้งใบ
-- A เปิดหน้า 9 โมง · B เปิด 9 โมงครึ่ง · A กดบันทึก 10 โมง · B กดบันทึก 10 โมงห้านาที
-- → ทุกช่องที่ A กรอกถูกทับด้วยค่าที่ค้างอยู่ในหน้าจอของ B (ซึ่งเป็นค่าก่อน A บันทึก)
-- งานของ A หายเงียบ ๆ ไม่มี error ไม่มีใครรู้
--
-- ตอนนี้จึงประทับเวลาไว้ทุกครั้งที่บันทึก แล้วให้หน้าจอส่ง "เวลาที่ตัวเองโหลดมา" กลับมาด้วย
-- ถ้าเวลาใน DB ใหม่กว่า = มีคนบันทึกแทรกระหว่างนั้น → เด้งถามก่อน ไม่ทับเงียบ ๆ
alter table stock_daily add column if not exists updated_at      timestamptz not null default now();
alter table stock_daily add column if not exists updated_by_name text;
create index if not exists idx_stock_daily_branch_date_updated on stock_daily (branch_id, date, updated_at desc);
