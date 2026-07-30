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

### [2] Activate AWS attendance → write ลง Supabase ✅ ส่วนระบบทำแล้ว
เมื่อพนักงาน scan ใบหน้า: AWS Rekognition verify → เขียนลง Supabase ทันที (ไม่มี export file)

**ที่เก็บจริงคือตาราง `time_clock` — 1 แถวต่อกะ ไม่ใช่ 1 แถวต่อการแตะ**
(clock_in / clock_out อยู่แถวเดียวกัน เพราะพนักงานกดเข้า-ออกของกะเดียวกัน และแอดมินต้องแก้เวลาเป็นคู่
· เก็บ %ใบหน้าที่ตรง · ระยะห่างจากร้านตอนกด · ใครแก้เวลาย้อนหลังพร้อมเหตุผล)

ระบบอื่นอ่านผ่าน **view `attendance_logs`** (อ่านอย่างเดียว มีอยู่แล้วในฐานข้อมูล):
`source_id · employee_id · branch · work_date · timestamp_in · timestamp_out ·
in_distance_m · out_distance_m · in_face_similarity · out_face_similarity · edit_note`

ที่ยังเหลือก่อนเปิดใช้จริง (ไม่ใช่งานเขียนโค้ด):
- สร้างบัญชีพนักงาน 6 คน → ให้แต่ละคนลงทะเบียนใบหน้าครั้งแรกเอง
- เซ็นหนังสือยินยอมเก็บข้อมูลใบหน้า (PDPA) ก่อนเริ่มใช้จริง — ไฟล์อยู่ในโฟลเดอร์ แบบฟอร์ม/

### [3] เพิ่ม "ตารางงานวันนี้" section
แสดงว่าวันนี้ใครเข้ากะอะไร อ่านจาก Supabase table `schedules`

### [4] Rename Vercel project ✅ เสร็จ 2026-07-30
- ชื่อ project: `ycstock` → `bqmp-ops`
- โดเมนใหม่: bqmp-ops.vercel.app (Add Existing ในหน้า Project → Domains)
- โดเมนเดิม yogurtculturestock.vercel.app ยังใช้ได้ ไม่ได้ปิด
- ค่อยตั้ง redirect โดเมนเดิม → โดเมนใหม่ ตอนพนักงานย้ายไอคอนครบ

## การจ้างและค่าแรง (สำคัญ — กันคิดเงินผิดวิธี)
- **พนักงานประจำ (FT) จ้างเป็นรายเดือน** ไม่ได้คิดเป็นรายชั่วโมง
  → ชั่วโมงในตารางกะ **ห้ามเอาไปคูณเป็นค่าแรง** ใช้แค่ 3 อย่าง:
  (1) เกณฑ์เริ่มนับ OT (2) ตรวจสาย/ไม่สแกนเข้า-ออก (3) ชั่วโมงจริงของ PT
- **Prince (PT, SND)** คิดเป็นรายชั่วโมงตามจริง 50 บาท/ชม. จ่ายทุกอังคาร
- OT: base ÷ 18,000 × 1.5 ต่อนาที · NVP นับหลัง 19:00 เฉพาะกะ F ·
  SND หลัง 18:00 และ KCN หลัง 20:00 ต้องเกิน 15 นาทีถึงเริ่มนับ
- ไม่สแกน: ไม่สแกนทั้งเข้าและออก = 2 ครั้ง · ขาดข้างเดียว = 1 ครั้ง · ครบ 5 ครั้งหัก base ÷ 60
- ประกันสังคม 5% ของ base สูงสุด 820 บาท · รอบจ่าย 26 ถึง 25 (โอน 2 ครั้ง: 15-17 และ 27-31)
- กะ SND: วันธรรมดา 08:00–18:00 · เสาร์และวันหยุดนักขัตฤกษ์ 09:00–15:00

## Connections กับระบบอื่น
- **Supabase** — database กลาง (write attendance_logs, read schedules)
- **bqmp.vercel.app** — ดึง stock overview และ attendance summary
- **bqmp-people.vercel.app** — พนักงานดู attendance log ของตัวเองที่นั่น

## Supabase Tables ที่เกี่ยวข้อง
**ของจริงในฐานข้อมูล (ตรวจสอบแล้ว 2026-07-30) — ห้ามแก้ view โดยไม่แจ้ง bqmp/bqmp-people ก่อน**

| ชื่อ | ชนิด | รายละเอียด |
|------|------|-----------|
| `time_clock` | ตาราง | ที่เก็บเวลาเข้า-ออกจริง · 1 แถวต่อกะ (clock_in + clock_out อยู่ด้วยกัน) |
| `attendance_logs` | **view** อ่านอย่างเดียว | source_id · employee_id · branch · work_date · timestamp_in · timestamp_out · in_distance_m · out_distance_m · in_face_similarity · out_face_similarity · edit_note |
| `users` | ตาราง | พนักงานตัวจริง — passcode_hash อยู่ที่นี่ และ **ไม่ถูกส่งออกผ่าน view ใด ๆ** |
| `employees` | **view** อ่านอย่างเดียว | id · name · branch · work_unit · active (เฉพาะคนที่ยัง active) |
| `schedules` | **ยังไม่มี** | ต้องสร้างตอนทำงาน [3] — ต้องได้ตารางกะ + เงื่อนไข OT/สาย/ครึ่งวัน จากแพรก่อน |

รหัสผ่านพนักงานอยู่ที่แอปนี้ที่เดียว — ถ้า bqmp-people ต้องให้พนักงานล็อกอิน ให้เรียก API ของแอปนี้
อย่าอ่าน hash ไปเทียบเอง (มี 2 ที่เมื่อไหร่ วันเปลี่ยนรหัสจะเพี้ยนทันที)

## ห้ามทำโดยไม่ถามก่อน
- เปลี่ยน attendance flow โดยไม่ sync กับ payroll script
- ลบ stock data ของ branch ใดก็ตาม
- แก้ Supabase schema โดยไม่แจ้ง bqmp.vercel.app และ bqmp-people ด้วย
