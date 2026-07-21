-- แก้ตาม feedback การใช้งานจริง 2026-07-21:

-- 1) เปลี่ยนชื่อ 4 รายการ Smoothies (Pre-packed) ใส่เลขเมนูกำกับ (แพรยืนยัน)
update items set name = 'Wake Up Call (1)' where id = 'it-096';
update items set name = 'Energy Sip (2)' where id = 'it-097';
update items set name = 'Yellow Madness (3)' where id = 'it-098';
update items set name = 'Ready to Glow (5)' where id = 'it-099';

-- 2) น้ำ Ice cream / Soft Serve — ผลผลิตไม่แน่นอน เปิดช่อง "+g" ตอนสั่ง/สั่งผลิต
update items set variable_yield = true where id = 'it-014';

-- 3) Gloves YG แยกไซซ์ S/M/L — เดิมเป็นรายการเดียว (it-086) เปลี่ยนชื่อเป็นไซซ์ S แล้วเพิ่ม M/L ใหม่
-- เลื่อน sort ของรายการหลัง Gloves (sort>=86) ขึ้นไป 2 ตำแหน่ง เปิดที่ว่างให้ M/L แทรกติดกับ S
update items set sort = sort + 2 where sort >= 86;

update items set name = 'Gloves YG S / ถุงมือ' where id = 'it-086';

insert into items (id, name, category, unit, is_special, is_cup, has_remainder, grams_per_uom, sort, check_frequency, show_remainder, variable_yield)
values
  ('it-114', 'Gloves YG M / ถุงมือ', 'ของใช้', 'Box', false, false, false, 0, 86, 'monThu', false, false),
  ('it-115', 'Gloves YG L / ถุงมือ', 'ของใช้', 'Box', false, false, false, 0, 87, 'monThu', false, false);

-- Par คัดลอกจาก S ไปทั้ง M/L ชั่วคราว (แพรต้องปรับ Par จริงแต่ละไซซ์เองที่หน้า Settings)
insert into par_levels (item_id, branch_id, level)
select 'it-114', branch_id, level from par_levels where item_id = 'it-086'
union all
select 'it-115', branch_id, level from par_levels where item_id = 'it-086';
