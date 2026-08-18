// /allowance — สิทธิ์ซื้อของในร้าน (พนักงาน) + ภาพรวมทีม (แอดมิน)
// ใช้ทั้งฝั่ง client (page.tsx, ผ่าน useLang) และฝั่ง server (route.ts ทั้ง 3 ไฟล์ใต้ api/allowance)
export const th = {
  pageTitle: "สิทธิ์ซื้อของในร้าน",
  notEnabled: "บัญชีนี้ยังไม่ได้รับสิทธิ์", // ใช้ร่วมกันทั้งข้อความในหน้าและ error จาก POST /api/allowance
  billImageAlt: "บิล",

  summary: {
    remainingLabel: "สิทธิ์คงเหลือเดือนนี้",
    usedOfMonthly: "ใช้ไปแล้ว {used} จาก {monthly} · รีเซ็ต {nextMonth}",
    // ข้อความ 3 ท่อนต่อกันเป็นบรรทัดเดียว — ท่อนกลาง (exhaustedNoRecord) โชว์ตัวหนา
    exhaustedNotice: "เดือนนี้ใช้สิทธิ์ครบแล้ว — ซื้อได้ในราคาลด 30% ตามปกติ",
    exhaustedNoRecord: " ไม่ต้องบันทึกเข้าระบบ",
    exhaustedReason: " เพราะไม่ได้ตัดจากสิทธิ์",
  },

  form: {
    heading: "บันทึกบิลที่ใช้สิทธิ์",
    dateLabel: "วันที่ซื้อ",
    billTotalLabel: "ยอดเต็มก่อนลด",
    discountLabel: "ส่วนลดที่ใช้สิทธิ์",
    paidSelfLabel: "จ่ายเอง",
    remainingAfterLabel: "สิทธิ์เหลือหลังบันทึก",
    overQuotaWarning: "ส่วนลดเกินสิทธิ์ที่เหลือ ({remaining}) — บันทึกได้ แต่จะถูกส่งให้แอดมินตรวจ",
    imageLabel: "รูปบิล — แนบแล้วระบบอ่านยอดให้อัตโนมัติ",
    saveButton: "บันทึกการใช้สิทธิ์",
    billTotalTooLow: "ยอดเต็มต้องไม่น้อยกว่าส่วนลด",
  },

  ocr: {
    reading: "กำลังอ่านยอดจากรูป…",
    unclear: "รูปไม่ชัดพอ — กรอกยอดเองแล้วตรวจอีกครั้งก่อนบันทึก",
    noDiscountFound: "ไม่เจอบรรทัดส่วนลดบนบิลนี้ — กรอกยอดเอง",
    done: "อ่านยอดจากรูปให้แล้ว ตรวจให้ตรงก่อนกดบันทึก",
    fallbackSuffix: " — กรอกยอดเองได้ตามปกติ", // ต่อท้ายข้อความ error ตอน readBill ล้มเหลว
  },

  save: {
    successAlert: "บันทึกการใช้สิทธิ์แล้ว ✓",
    needsReviewAlert: "บันทึกแล้ว — แต่ส่งให้แอดมินตรวจ\n{note}",
    genericError: "บันทึกไม่สำเร็จ",
  },

  list: {
    heading: "ใช้ไปเดือนนี้",
    empty: "ยังไม่มีรายการ",
    billAndPaid: "บิล {bill} · จ่ายเอง {paid}",
    pendingReview: " · รอแอดมินตรวจ",
  },

  admin: {
    sectionTitle: "ภาพรวมทีม (แอดมิน)",
    totalUsed: "ใช้ไปรวม",
    totalQuota: "โควตารวม",
    noOneEnabled: "ยังไม่มีใครเปิดสิทธิ์",
    usedShort: "ใช้ {amount}",
    remainingShort: "เหลือ {amount}",
    needsReviewTitle: "บิลที่ต้องตรวจ ({count})",
  },

  // ── error ฝั่ง API (route.ts / overview / read-bill) ──
  errors: {
    invalidMonth: "month ไม่ถูกต้อง (YYYY-MM)",
    invalidDate: "วันที่ไม่ถูกต้อง",
    discountMustBePositive: "ยอดส่วนลดต้องมากกว่า 0",
    unsupportedMediaType: "รองรับเฉพาะ JPEG/PNG/WebP",
    noImageAttached: "ไม่มีรูปแนบ",
    readBillFailed: "อ่านบิลไม่สำเร็จ",
  },
};
