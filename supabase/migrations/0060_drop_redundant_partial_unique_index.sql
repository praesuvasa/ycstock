-- ต่อจาก 0059 — index บางส่วนตัวเดิมซ้ำซ้อนแล้ว ลบทิ้งไม่ให้ทุกการเขียนต้องอัปเดต 2 index
drop index if exists uq_production_order_items_item_branch;
