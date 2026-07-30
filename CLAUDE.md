# CLAUDE.md — yogurtculturestock (Store Operations App)

## ระบบนี้คืออะไร
Store operations app สำหรับพนักงานหน้าร้าน BQMP ใช้ทุกวันในการทำงาน
URL: https://yogurtculturestock.vercel.app

## Organization Context
BQMP ประกอบด้วย 3 business units:
- **Yogi** — ผลิตและขายส่ง
- **YC (Yogurt Culture)** — retail branches
- **Staple** — แบรนด์ใหม่ (สาขาแรก co-locate กับ YC ที่ KCN และ NCH)

## Branches ที่ใช้ระบบนี้
| Branch | BU | หมายเหตุ |
|--------|-----|---------|
| NVP | YC | 3 FT (Kik/Fai/Noona) |
| SND | YC | 1 FT (Yam) + 1 PT (Prince) |
| KCN | YC + Staple | shared staff/POS/stock |
| NCD | YC + Staple | เปิด ก.ย. 2569 |

## Features ในระบบนี้
- Stock management (มีอยู่แล้ว)
- บันทึกยอดขาย (มีอยู่แล้ว)
- รายงาน / เปิด-ปิดร้าน (มีอยู่แล้ว)
- **AWS Face Recognition Attendance** — set up แล้ว ยังไม่ live

## Attendance System (สำคัญ)
ระบบ scan ใบหน้า ใช้ AWS Rekognition
- Set up แล้ว ทดสอบแล้ว ยังไม่เปิดให้ staff ใช้จริง
- **เมื่อ activate: ต้อง write ผลลัพธ์ลง Supabase ทันที** (ไม่ export file)
- Table target: `attendance_logs` — { employee_id, timestamp, type: 'in'/'out', branch }
- ข้อมูลนี้จะถูกอ่านโดย payroll script และ bqmp.vercel.app

## Connections กับระบบอื่น
- **Supabase** — database กลาง (attendance, stock levels)
- **bqmp.vercel.app** — ดึง stock overview และ attendance summary
- **bqmp-people.vercel.app** — พนักงานดู attendance ของตัวเองผ่านที่นั่น

## KCN + Staple Shared Context
KCN และ NCH: YC กับ Staple ใช้ staff/POS/stock ชุดเดียวกัน
- ยอดขาย track แยก brand (YC vs Staple)
- พนักงานสังกัด YC แต่ทำงานให้ทั้ง 2 brand
- จนกว่า Staple จะมีสาขาแยกออกไป

## Stack
- Frontend: Vercel (static/Next.js)
- Attendance: AWS Rekognition
- Database: Supabase
- Built by: Claude Code

## สิ่งที่ยังต้องเพิ่ม
- [ ] เปิดใช้ AWS attendance จริง → write ลง Supabase
- [ ] เพิ่ม "ตารางงานวันนี้" section
- [ ] รองรับ Yogi BU

## ห้ามทำโดยไม่ถามก่อน
- เปลี่ยน attendance flow โดยไม่ sync กับ payroll script
- ลบ stock data ของ branch ใดก็ตาม
- แก้ไข Supabase schema โดยไม่ update CLAUDE.md ของ bqmp และ bqmp-people ด้วย
