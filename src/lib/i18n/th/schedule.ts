// /schedule — หน้าตารางงาน (มุมมองตาราง คน × วัน) + คำขอลา/สลับกะที่รออนุมัติ
export const th = {
  monthNav: {
    prev: "← ก่อนหน้า",
    next: "ถัดไป →",
  },
  // วันในสัปดาห์ตัวย่อ (หัวตาราง)
  dow: {
    sun: "อา", mon: "จ", tue: "อ", wed: "พ", thu: "พฤ", fri: "ศ", sat: "ส",
  },
  // ชื่อเดือนตัวย่อ ใช้กับ monthLabel() — ปีที่ต่อท้ายเป็น พ.ศ. เฉพาะภาษาไทย (ดูใน page.tsx)
  months: {
    jan: "ม.ค.", feb: "ก.พ.", mar: "มี.ค.", apr: "เม.ย.", may: "พ.ค.", jun: "มิ.ย.",
    jul: "ก.ค.", aug: "ส.ค.", sep: "ก.ย.", oct: "ต.ค.", nov: "พ.ย.", dec: "ธ.ค.",
  },
  shift: {
    // ตัวย่อในช่องตาราง — F/M/A/PT เป็นรหัสกะตรงกับไฟล์ Roster ทั้งสองภาษา ไม่ต้องแปล
    short: {
      fh: "ครึ่ง", off: "หยุด", closed: "ปิด", ph: "หยุดปี",
      al: "พักร้อน", sl: "ป่วย", pl: "กิจ", lwp: "ไม่รับเงิน",
    },
    // ปุ่มเปลี่ยนเป็นกะ (ในกล่องแก้ตาราง)
    work: {
      f: "เต็มวัน", m: "กะเช้า", a: "กะบ่าย", fh: "ครึ่งวัน", off: "หยุด",
    },
    // ปุ่มบันทึกเป็นวันลา (ในกล่องแก้ตาราง)
    leave: {
      al: "ลาพักร้อน", pl: "ลากิจ", sl: "ลาป่วย", ph: "หยุดประจำปี",
    },
  },
  // กล่องแตะช่อง (แก้ตาราง/ขอลา)
  picker: {
    noSchedule: "ยังไม่มีตาราง",
    nowPrefix: "ตอนนี้ ",
    changeToShift: "เปลี่ยนเป็นกะ",
    saveAsLeave: "บันทึกเป็นวันลา",
    requestLeaveToday: "ขอลาวันนี้",
    sickSwapHint: "ลาป่วยและการสลับวันหยุด แจ้ง senior staff หรือแอดมินให้บันทึกให้",
    close: "ปิด",
    promptEditReason: "เหตุผลที่แก้ตาราง (แอดมินเห็นทุกครั้ง)",
    promptLeaveReason: "เหตุผลการลา (แอดมินเห็นทุกครั้ง)",
    reasonRequiredTitle: "ต้องเขียนเหตุผล",
    reasonRequiredBody: "อย่างน้อย 3 ตัวอักษร",
    errSaveFailed: "บันทึกไม่สำเร็จ",
    saveFailedTitle: "บันทึกไม่ได้",
    savedTitle: "บันทึกแล้ว",
    savedDowngradedTitle: "สิทธิ์ลาหมด — บันทึกเป็นลาไม่รับค่าจ้าง",
    remainingLeaveBody: "เหลือสิทธิ์อีก {n} วันในปีนี้",
  },
  // คำขอรออนุมัติ (สลับกะ)
  requests: {
    pendingTitle: "คำขอรออนุมัติ ({n})",
    requestedByPrefix: "ขอโดย ",
    approve: "อนุมัติ",
    reject: "ไม่อนุมัติ",
    actionFailedTitle: "ทำรายการไม่สำเร็จ",
    approvedTitle: "อนุมัติแล้ว — สลับกะให้เรียบร้อย",
    rejectedTitle: "ปฏิเสธคำขอแล้ว",
  },
  // ตารางหลัก + ข้อความท้ายตาราง
  table: {
    dateColumnHeader: "วันที่ →",
    emptyMonthTitle: "ยังไม่มีตารางของเดือนนี้",
    emptyMonthHint: "แอดมินหรือ senior staff เป็นคนจัดตาราง",
    hintEditable: "แตะช่องไหนก็แก้ได้เลย — ระบบเช็คให้ก่อนบันทึกว่าคนเข้ากะวันนั้นครบเงื่อนไขไหม และหยุดเกินโควตาหรือยัง",
    hintReadonly: "แตะช่องของตัวเองเพื่อขอลา · ทุกคำขอแจ้ง senior staff และแอดมินอัตโนมัติ",
  },
  summary: {
    title: "สรุปทั้งเดือน",
    work: "ทำงาน",
    off: "หยุด",
    leave: "ลา",
  },
  // ข้อความ error จาก /api/schedules (PATCH) — session.lang ฝั่งเซิร์ฟเวอร์
  api: {
    editForbidden: "แก้ตารางได้เฉพาะแอดมินและ senior staff — คนอื่นใช้ปุ่มขอลา/ขอสลับแทน",
    invalidDate: "วันที่ไม่ถูกต้อง",
    missingPersonOrShift: "ต้องระบุคนและกะ",
    reasonTooShort: "เขียนเหตุผลด้วย (อย่างน้อย 3 ตัวอักษร)",
  },
};
