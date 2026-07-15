-- เพิ่มกลุ่มเศษรวม (Strawberry/Blueberry) สำหรับ DB ที่ตั้งไปแล้ว
alter table items add column if not exists remainder_group text;

-- default groups + กรัมต่อกล่อง (ตั้งเพิ่ม/แก้ได้หน้า Settings)
update items set remainder_group = 'Strawberry', grams_per_uom = 250 where name = 'Strawberry (250g)';
update items set remainder_group = 'Strawberry', grams_per_uom = 500 where name = 'Strawberry (500g)';
update items set remainder_group = 'Blueberry',  grams_per_uom = 125 where name = 'Blueberry (125g)';
update items set remainder_group = 'Blueberry',  grams_per_uom = 300 where name = 'Blueberry (300g)';
update items set remainder_group = 'Blueberry',  grams_per_uom = 500 where name = 'Blueberry (500g)';

notify pgrst, 'reload schema';
