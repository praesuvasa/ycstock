-- เพิ่มคอลัมน์เศษกรัม (ไม่เต็มแพ็ค) ให้ restock_selections — บางรอบผลผลิตออกมาไม่เต็มกล่อง (เช่น Yuzu 1 แพ็ค + 700g)
-- ต้องแยกบันทึกกรัมได้ต่างหากจากจำนวนแพ็ค ไม่ปัดเป็นทศนิยมแพ็ค
alter table restock_selections add column if not exists qty_g numeric not null default 0;
