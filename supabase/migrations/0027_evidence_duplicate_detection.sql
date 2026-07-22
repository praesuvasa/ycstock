-- ป้องกันสลิป/หลักฐานซ้ำ (v1.8) — แพรกังวลเรื่อง: อัปโหลดเอกสารเดิมซ้ำ, ถ่ายคนละมุม,
-- ใช้ยอดเดิมกับหลายวัน, หรือถ่ายภาพจากรูปในมือถืออีกที (screenshot-of-screenshot)
-- แนวทาง: ให้ Claude อ่าน "เลขอ้างอิงรายการ/เลขที่เอกสาร" จากรูปด้วย แล้วเทียบกับที่เคยบันทึกไว้
-- ทนต่อมุมถ่าย/รูปแบบไฟล์ เพราะเทียบที่ "เนื้อหาเอกสาร" ไม่ใช่ pixel ของรูป
alter table sales_evidence add column if not exists ocr_txn_ref text;
alter table sales_evidence add column if not exists ocr_txn_time text;
alter table sales_evidence add column if not exists duplicate_note text;
alter table sales_evidence drop constraint if exists sales_evidence_match_status_check;
alter table sales_evidence add constraint sales_evidence_match_status_check
  check (match_status in ('ok','mismatch','unclear','duplicate','pending'));
create index if not exists sales_evidence_txn_ref_idx on sales_evidence (ocr_txn_ref) where ocr_txn_ref is not null;

alter table cash_remittances add column if not exists ocr_txn_ref text;
alter table cash_remittances add column if not exists ocr_txn_time text;
alter table cash_remittances add column if not exists duplicate_note text;
alter table cash_remittances drop constraint if exists cash_remittances_match_status_check;
alter table cash_remittances add constraint cash_remittances_match_status_check
  check (match_status in ('ok','mismatch','unclear','duplicate','pending'));
create index if not exists cash_remittances_txn_ref_idx on cash_remittances (ocr_txn_ref) where ocr_txn_ref is not null;
