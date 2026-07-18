-- ติดตาม "เคยเปิดดูแล้ว" ของคำขอเบิก — ใช้ทำ badge เตือนที่เมนู + การ์ดใน Dashboard
-- null = ยังไม่มีใครเปิดหน้า "ขอเบิกสินค้า" ดู list รวมเลย (shared state ทีมเดียวกัน ไม่แยกต่อ user)
alter table requisitions add column if not exists seen_at timestamptz;
