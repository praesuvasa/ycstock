-- ป้องกันไม่ให้ passcode_hash/setup_code_hash ถูกเขียนเป็นค่าที่แอปอ่านไม่ออกอีก (v1.29)
--
-- เจอซ้ำหลายรอบ: มีคนเข้าไปแก้ passcode_hash ตรงใน Supabase โดยตรง (ไม่ผ่านแอป) ด้วยค่า
-- sha256 ดิบ 64 ตัวอักษรไม่มี ":" คั่น ซึ่งไม่ใช่รูปแบบที่ verifyPasscode (src/lib/auth.ts) เข้าใจ
-- (แอปต้องการ "salt:hash" — salt hex 32 ตัว ":" hash hex 64 ตัว จาก scryptSync)
-- ผลคือ login ใช้ไม่ได้ทันทีโดยไม่มี error ให้เห็นตอนเขียน ต้องมาไล่หาทีหลังทุกครั้ง (เกิดซ้ำแทบทุกวัน)
--
-- ใส่ CHECK constraint ให้ Postgres ปฏิเสธค่าที่ผิดรูปแบบตั้งแต่ตอนเขียน แทนที่จะปล่อยให้เงียบแล้วพังทีหลัง
-- ต้อง null passcode_hash/setup_code_hash ที่ค้างเป็นค่าผิดรูปแบบของ u-admin + พนักงาน 6 คนก่อนแล้ว (execute_sql)
-- ไม่งั้น ADD CONSTRAINT จะ fail ทันทีเพราะข้อมูลเดิมไม่ผ่าน

alter table users
  add constraint passcode_hash_format
  check (passcode_hash is null or passcode_hash ~ '^[0-9a-f]{32}:[0-9a-f]{64}$');

alter table users
  add constraint setup_code_hash_format
  check (setup_code_hash is null or setup_code_hash ~ '^[0-9a-f]{32}:[0-9a-f]{64}$');

notify pgrst, 'reload schema';
