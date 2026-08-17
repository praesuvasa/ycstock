-- v1.31 · ภาษาที่ผู้ใช้เลือก (แพรสั่ง 2026-08-17) — เตรียมรองรับพนักงานต่างชาติที่ NCD
-- default 'th' สำหรับทุกคน (ไม่กระทบ NVP/SND/KCN เลย) · ผู้ใช้ NCD ตั้งเป็น 'en' เอง หรือแอดมินตั้งให้ตอนสร้างบัญชี
alter table users add column if not exists preferred_lang text not null default 'th';
alter table users drop constraint if exists users_preferred_lang_check;
alter table users add constraint users_preferred_lang_check check (preferred_lang in ('th','en'));
comment on column users.preferred_lang is 'ภาษา UI ที่ผู้ใช้เลือก — th (ค่าเริ่มต้นทุกสาขา) / en (สำหรับพนักงานต่างชาติ เช่นที่ NCD)';
