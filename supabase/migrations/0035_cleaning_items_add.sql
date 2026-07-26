-- เพิ่มรายการหมวด "น้ำยาทำความสะอาด" 2 ตัว (แพรยืนยัน 2026-07-26, Par เริ่มต้น 1)
--   น้ำยาล้างผลไม้  — ทุกสาขา (SND/NVP/KCN = 1/1/1)
--   น้ำยาซักผ้า     — เฉพาะ NVP (SND/KCN = null คือ "ไม่ stock" ไม่ใช่ 0)
-- ใช้ id ต่อท้ายของเดิม (max = it-116) และ sort ต่อท้ายสุด (max = 115) ตามกฎ "เพิ่มท้าย ไม่แทรกกลาง"
-- กัน id ของไอเทมเดิมเลื่อน — หน้าจอจัดกลุ่มตามชื่อ category ไม่ได้อิงลำดับ sort จึงยังไปอยู่รวมกับน้ำยาตัวอื่นตามปกติ
-- check_frequency = monThu ให้ตรงกับน้ำยาทำความสะอาดตัวอื่นทั้งหมด (ไม่ได้เช็คทุกวัน)

insert into items (id, name, category, unit, sort, check_frequency)
values
  ('it-117', 'น้ำยาล้างผลไม้', 'น้ำยาทำความสะอาด', 'ขวด', 116, 'monThu'),
  ('it-118', 'น้ำยาซักผ้า',   'น้ำยาทำความสะอาด', 'ขวด', 117, 'monThu')
on conflict (id) do nothing;

insert into par_levels (item_id, branch_id, level)
values
  ('it-117', 'SND', 1),
  ('it-117', 'NVP', 1),
  ('it-117', 'KCN', 1),
  ('it-118', 'SND', null),
  ('it-118', 'NVP', 1),
  ('it-118', 'KCN', null)
on conflict (item_id, branch_id) do update set level = excluded.level;
