# CLAUDE.md — BQMP Store (Store Operations App)

## ระบบนี้คืออะไร
Store operations app สำหรับพนักงานหน้าร้าน BQMP ใช้ทุกวันในการทำงาน
URL ปัจจุบัน: https://yogurtculturestock.vercel.app
URL ใหม่ (กำลังเปลี่ยน): https://bqmp-store.vercel.app

## Organization: BQMP
ประกอบด้วย 3 business units:
- **Yogi** — ผลิตและขายส่ง
- **YC (Yogurt Culture)** — retail branches (NVP, SND, KCN)
- **Staple** — แบรนด์ใหม่ (KCN + NCD เปิด ก.ย. 2569, co-locate กับ YC)

## Branches
| Branch | BU | พนักงาน | หมายเหตุ |
|--------|-----|---------|---------|
| NVP | YC | Kik, Fai, Noona (FT) | 3 คน |
| SND | YC | Yam (FT), Prince (PT) | ปิดอาทิตย์ เสาร์ครึ่งวัน |
| KCN | YC + Staple | Dao (FT) | shared staff/POS/stock |
| NCD | YC + Staple | TBD | เปิด ก.ย. 2569 |

## Features แยกตาม BU

**YC + Staple (path /yc, /staple) — retail:**
- Stock management ✅ | บันทึกยอดขาย ✅ | รายงาน/เปิด-ปิดร้าน ✅
- AWS Face Recognition Attendance ⚠️ (set up แล้ว ยังไม่ live)

**Yogi (path /yogi) — ฝั่งผลิต:**
- ไม่มี POS / ยอดขาย / เปิด-ปิดร้าน
- ต้องมี: เช็คสต๊อกกลาง (YC ดึงจากที่นี่), สต๊อกวัตถุดิบ, บันทึกค่าการผลิต (production log)

## สิ่งที่ต้องทำ (priority order)

### [1] เพิ่ม path-based routing ต่อ unit
พนักงานแต่ละ unit เข้าผ่าน path ของตัวเอง:
- /yc     → โลโก้/สี YC     | Primary: #F2565C (Mouthful Red) | Palette: #84D7FF (Dairy Blue) #FF8C33 (Tasty Orange)
- /staple → โลโก้/สี Staple | Primary: #542916 (Dark Brown) | Palette: #B79858, #A13A1E, #F1C166, #88B8CE, #FEFAF0
- /yogi   → โลโก้/สี Yogi   | Primary: #29B5E8 (Sky Blue)

สำคัญ: /yogi แสดง feature ต่างจาก /yc และ /staple
- /yogi ไม่มี: POS, ยอดขาย, เปิด-ปิดร้าน, attendance scan
- /yogi มี: stock กลาง, stock วัตถุดิบ, production log

หลัง login ข้อมูลกรองตาม branch/unit ของพนักงานอัตโนมัติ

### [2] Activate AWS attendance → write ลง Supabase
เมื่อพนักงาน scan ใบหน้า:
- AWS Rekognition verify → ได้ employee_id
- Write ลง Supabase table `attendance_logs` ทันที:
  { employee_id, timestamp, type: 'in'/'out', branch, unit }
- ห้าม export file — ต้อง write ลง Supabase โดยตรง
- ข้อมูลนี้จะถูกอ่านโดย payroll script และ bqmp.vercel.app

### [3] เพิ่ม "ตารางงานวันนี้" section
แสดงว่าวันนี้ใครเข้ากะอะไร อ่านจาก Supabase table `schedules`

### [4] Rename Vercel project
เปลี่ยนชื่อ project บน Vercel จาก yogurtculturestock → bqmp-store
URL ใหม่: bqmp-store.vercel.app

## Connections กับระบบอื่น
- **Supabase** — database กลาง (write attendance_logs, read schedules)
- **bqmp.vercel.app** — ดึง stock overview และ attendance summary
- **bqmp-people.vercel.app** — พนักงานดู attendance log ของตัวเองที่นั่น

## Supabase Tables ที่เกี่ยวข้อง
- `attendance_logs` — { id, employee_id, timestamp, type, branch, unit }
- `schedules` — { employee_id, date, shift, branch }
- `employees` — { id, name, branch, unit, pin_hash }

## ห้ามทำโดยไม่ถามก่อน
- เปลี่ยน attendance flow โดยไม่ sync กับ payroll script
- ลบ stock data ของ branch ใดก็ตาม
- แก้ Supabase schema โดยไม่แจ้ง bqmp.vercel.app และ bqmp-people ด้วย
