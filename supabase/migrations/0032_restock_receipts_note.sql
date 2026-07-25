-- ยืนยันรับของ: เพิ่มช่องหมายเหตุต่อรายการ (พับเก็บไว้ ไม่บังคับกรอก)
alter table restock_receipts add column note text not null default '';
