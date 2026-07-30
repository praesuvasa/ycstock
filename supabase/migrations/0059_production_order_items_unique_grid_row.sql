-- v1.24 · ทำให้ upsert ของใบสั่งผลิตทำงานได้จริง
--
-- โค้ดฝั่งแอป upsert ด้วย onConflict "order_id,item_id,branch_key" มาตลอด
-- แต่ index ที่มีอยู่เป็น partial (WHERE item_id IS NOT NULL) ซึ่ง Postgres จะเลือกใช้ให้ก็ต่อเมื่อ
-- คำสั่งเขียน predicate เดียวกันมาด้วย — PostgREST ไม่ได้ส่งไป จึงขึ้น
-- "there is no unique or exclusion constraint matching the ON CONFLICT specification"
--
-- เดิมไม่มีใครเจอ เพราะการบันทึกเกือบทุกครั้งเป็นการ "สร้างใบใหม่" (INSERT ล้วน) ไม่เข้าเส้นทาง upsert
-- พอเปลี่ยนให้เปิดใบเดิมมาแก้ต่อ (34f91ae) ทุกการบันทึกก็วิ่งเข้าเส้นทางนี้ทันที
--
-- แถวรายการพิเศษ (item_id/branch_key = NULL) ไม่ถูกจำกัด เพราะ Postgres นับ NULL เป็นค่าที่ไม่ซ้ำกันเสมอ
create unique index if not exists production_order_items_order_item_branch_uidx
  on production_order_items (order_id, item_id, branch_key);
