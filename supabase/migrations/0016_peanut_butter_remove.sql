-- Peanut Butter (it-018) ตัด Par ออก 2026-07-19 — ไม่มีของเข้า ถ้ากลับมาใช้จะแจ้งเพิ่มใหม่
update par_levels set level = null where item_id = 'it-018';
update items set check_frequency = 'daily' where id = 'it-018';
