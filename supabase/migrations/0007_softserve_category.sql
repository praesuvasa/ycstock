-- ย้าย "Softserve ถ้วยกระดาษ" จากหมวด "Softserve TH" ไป "Soft Serve / Ice Cream" + ตั้ง Par 5 ทั้ง 2 สาขา (สำหรับ DB ที่ตั้งไปแล้ว)
update items set category = 'Soft Serve / Ice Cream' where name = 'Softserve ถ้วยกระดาษ';
update par_levels set level = 5 where item_id = (select id from items where name = 'Softserve ถ้วยกระดาษ');

notify pgrst, 'reload schema';
