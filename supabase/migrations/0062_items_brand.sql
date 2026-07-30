-- v1.25 · แท็กแบรนด์ที่ตัวสินค้า (เตรียมไว้ก่อน Staple เปิด NCD ก.ย. 2569)
-- ทำไมแท็กที่สินค้า ไม่แยกหน้าจอ: KCN/NCD พนักงานคนเดียวขายทั้ง 2 แบรนด์ในกะเดียว ใช้ POS/สต็อกชุดเดียว
-- shared = ของที่ใช้ร่วมกันทั้ง 2 แบรนด์ (ถ้วย ถุง ช้อน) · ค่าเริ่มต้น yc = ของทั้งหมดที่มีอยู่วันนี้
alter table items add column if not exists brand text not null default 'yc';
alter table items drop constraint if exists items_brand_check;
alter table items add constraint items_brand_check check (brand in ('yc', 'staple', 'shared'));
