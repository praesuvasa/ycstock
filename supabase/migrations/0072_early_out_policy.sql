-- v1.26 · NVP กะปิดร้านออกก่อนเวลาได้ถ้างานเสร็จ · กะเช้าต้องออกตามเวลา (แพรระบุ 2026-07-30)
-- มีผลกับการตรวจเวลา ไม่ใช่ค่าแรง — ถ้าไม่แยกไว้ ระบบจะฟ้องว่ากะ F/A ออกก่อนเวลาทุกวัน
alter table shift_definitions add column if not exists early_out_allowed boolean not null default false;
update shift_definitions set early_out_allowed=true, note = note || ' · ออกก่อน 21:30 ได้ถ้างานเสร็จ'
 where branch_id='NVP' and code in ('F','A');
update shift_definitions set early_out_allowed=false, note = note || ' · ต้องออกตามเวลา 19:00 ไม่ใช่กะปิดร้าน'
 where branch_id='NVP' and code='M';
