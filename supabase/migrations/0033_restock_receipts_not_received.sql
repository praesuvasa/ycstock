-- ยืนยันรับของ: ติ๊กช่อง "ไม่ได้รับ" ได้ — บันทึกว่าตรวจสอบแล้ว (ไม่ใช่ค้างต่อ) แต่ไม่ auto-fill เข้าสต็อก
alter table restock_receipts add column not_received boolean not null default false;
