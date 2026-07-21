-- เปลี่ยนชื่อหมวด "Yogurt Shake" → "Yogurt Shake Toppings" (แพรยืนยัน 2026-07-21)
-- ย้ายไปคอลัมขวาในใบพิมพ์ต่อจาก Toppings ด้วย (ดู PRINT_RIGHT_CATEGORIES ใน restock/page.tsx)
update items set category = 'Yogurt Shake Toppings' where category = 'Yogurt Shake';
