-- แก้บั๊ก: ตอนเพิ่ม 4 รายการ CUP (Cup P/S/Bowl/14oz) เข้า SHOW_REMAINDER_ON_RESTOCK ใน seed-data.ts
-- แก้แค่ไฟล์ seed (ใช้กับ dev/store-memory เท่านั้น) ลืม sync คอลัมน์ show_remainder ใน items table จริงบน prod
-- ผลคือหน้า "ต้องเติม" ยังไม่โชว์เศษ CUP เพราะ DB ยังเป็น false อยู่ — อัปเดตให้ตรงกับ seed-data.ts
update items set show_remainder = true
where name in ('Cup P (5oz)', 'Cup S (9oz)', 'Small Bowl', 'Cup (14oz)');
