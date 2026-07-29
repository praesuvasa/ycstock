-- v1.24 · หลักฐานชนิดใหม่ "pos" = รูปหน้ารายงานสรุปยอดขายบน POS iPad
-- ใช้แทนช่องพิมพ์ "ยอดขายรวมตาม POS" ที่พนักงานสับสนว่าต้องเอาเลขมาจากไหน (แพรสั่ง 2026-07-29)
alter table sales_evidence drop constraint sales_evidence_evidence_type_check;
alter table sales_evidence add constraint sales_evidence_evidence_type_check
  check (evidence_type = any (array['qr'::text, 'grab'::text, 'lineman'::text, 'pos'::text]));
