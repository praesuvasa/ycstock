-- ให้พนักงานตั้ง PIN เอง แอดมินไม่ต้องรู้ (v1.15) — แพรขอ 2026-07-27
--
-- เดิม: แอดมินตั้ง PIN ให้ → แอดมินรู้รหัสของทุกคน ซึ่งทำให้ audit log พิสูจน์อะไรไม่ได้เลย
--       (ถ้ารหัสรั่ว ก็ไม่รู้ว่าใครเป็นคนทำจริง)
-- ใหม่: แอดมินออก "รหัสตั้งค่า" ใช้ครั้งเดียว → พนักงานเข้าครั้งแรกแล้วบังคับตั้ง PIN ของตัวเอง
--       PIN จริงเก็บเป็น hash เท่านั้น ไม่มีใครดูย้อนได้ รวมทั้งแอดมิน · ลืมแล้วออกรหัสตั้งค่าใหม่
alter table users add column if not exists setup_code_hash        text;
alter table users add column if not exists setup_code_expires_at  timestamptz;
alter table users add column if not exists must_set_passcode      boolean not null default false;
alter table users add column if not exists passcode_set_at        timestamptz;
-- บัญชีที่เพิ่งสร้างยังไม่มี PIN (มีแต่รหัสตั้งค่า) จึงต้องยอมให้ว่างได้
alter table users alter column passcode_hash drop not null;

-- หน่วงเวลาเมื่อกรอกรหัสผิดซ้ำ ๆ
-- จำเป็นเพราะแอปนี้ใช้ PIN อย่างเดียวเป็นตัวระบุตัวตน (ไม่มีชื่อผู้ใช้) — กรอกถูกคือเข้าได้เลย
-- ถ้าไม่จำกัด ใครเปิดเว็บเจอก็ไล่เดาเลขได้ไม่จำกัดครั้ง
create table if not exists login_attempts (
  ip           text not null,
  attempted_at timestamptz not null default now(),
  ok           boolean not null default false
);
create index if not exists idx_login_attempts_ip_time on login_attempts (ip, attempted_at desc);
alter table login_attempts enable row level security;
