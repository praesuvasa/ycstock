-- ส่งคืน/เสีย เป็นกรัม (เฉพาะ item leader ของกลุ่มเศษรวม เช่น Strawberry/Blueberry)
alter table stock_daily add column if not exists returned_g numeric not null default 0;

notify pgrst, 'reload schema';
