# CLAUDE.md — BQMP Store (Store Operations App)

## ระบบนี้คืออะไร
Store operations app สำหรับพนักงานหน้าร้าน BQMP ใช้ทุกวันในการทำงาน
URL หลัก: https://bqmp-ops.vercel.app
URL เดิม (ยังใช้ได้): https://yogurtculturestock.vercel.app
Vercel project: `bqmp-ops` (เปลี่ยนจาก `ycstock` เมื่อ 2026-07-30)

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

**YC + Staple (path /store) — retail (ใช้ path เดียวกัน):**
- Stock management ✅ | บันทึกยอดขาย ✅ | รายงาน/เปิด-ปิดร้าน ✅
- AWS Face Recognition Attendance ⚠️ (set up แล้ว ยังไม่ live)

**Yogi (path /yogi) — ฝั่งผลิต:**
- ไม่มี POS / ยอดขาย / เปิด-ปิดร้าน
- ต้องมี: เช็คสต๊อกกลาง (YC ดึงจากที่นี่), สต๊อกวัตถุดิบ, บันทึกค่าการผลิต (production log)

## สิ่งที่ต้องทำ (priority order)

### [1] เพิ่ม path-based routing — 2 path (แพรตัดสิน 2026-07-30)
- /store → หน้าร้าน (YC + Staple ใช้ร่วมกัน)
- /yogi  → ฝ่ายผลิต

**ทำไมไม่แยก /yc กับ /staple:** ที่ KCN และ NCD พนักงานคนเดียวขายทั้ง 2 แบรนด์ในกะเดียว
ใช้ POS/สต็อก/ตู้ชุดเดียวกัน ถ้าแยก path จะต้องสลับไปมาระหว่างกะ และเช็คสต็อกซ้ำ 2 รอบสำหรับของชุดเดียว
→ แยกแบรนด์ด้วย **แท็กแบรนด์ที่ตัวสินค้าและยอดขาย** แทน (ยอดขายยัง track แยก YC/Staple ได้ครบ)

สี/โลโก้เลือกตามสาขาและแบรนด์ของรายการ ไม่ใช่ตาม path:
- YC     | Primary: #F2565C (Mouthful Red) | Palette: #84D7FF (Dairy Blue) #FF8C33 (Tasty Orange)
- Staple | Primary: #542916 (Dark Brown) | Palette: #B79858, #A13A1E, #F1C166, #88B8CE, #FEFAF0
- Yogi   | Primary: #29B5E8 (Sky Blue)
- KCN/NCD ที่ขายทั้ง 2 แบรนด์ โชว์ได้ทั้งคู่

/yogi แสดง feature ต่างจาก /store:
- /yogi ไม่มี: POS, ยอดขาย, เปิด-ปิดร้าน
- /yogi มี: stock กลาง, stock วัตถุดิบ, production log, ลงเวลาเข้า-ออกงาน (ไม่ผูกสาขา)

หลัง login ข้อมูลกรองตาม branch/unit ของพนักงานอัตโนมัติ (ทำไว้แล้วบางส่วน — users.work_unit)

### [2] Activate AWS attendance → write ลง Supabase
เมื่อพนักงาน scan ใบหน้า:
- AWS Rekognition verify → ได้ employee_id
- Write ลง Supabase table `attendance_logs` ทันที:
  { employee_id, timestamp, type: 'in'/'out', branch, unit }
- ห้าม export file — ต้อง write ลง Supabase โดยตรง
- ข้อมูลนี้จะถูกอ่านโดย payroll script และ bqmp.vercel.app

### [3] เพิ่ม "ตารางงานวันนี้" section
แสดงว่าวันนี้ใครเข้ากะอะไร อ่านจาก Supabase table `schedules`

### [4] Rename Vercel project ✅ เสร็จ 2026-07-30
- ชื่อ project: `ycstock` → `bqmp-ops`
- โดเมนใหม่: bqmp-ops.vercel.app (Add Existing ในหน้า Project → Domains)
- โดเมนเดิม yogurtculturestock.vercel.app ยังใช้ได้ ไม่ได้ปิด
- ค่อยตั้ง redirect โดเมนเดิม → โดเมนใหม่ ตอนพนักงานย้ายไอคอนครบ

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
