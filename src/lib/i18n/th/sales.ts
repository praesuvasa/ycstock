// /sales — บันทึกยอดขายรายวัน + ตรวจกับ POS/สลิป (client page) + /api/sales, /api/sales/pos-report,
// /api/sales/incidents, /api/sales-evidence (server-side error strings)
export const th = {
  // ── สถานะผลตรวจหลักฐาน (MATCH_LABEL) ──
  matchOk: "✅ ยอดถูกต้อง",
  matchMismatch: "⚠️ ไม่ตรง",
  matchUnclear: "⚠️ อ่านไม่ชัด ตรวจสอบเอง",
  matchDuplicate: "🚫 รูปนี้ถูกใช้ไปแล้ว",
  matchPending: "⏳ กำลังตรวจสอบ",

  // ── ช่องแนบหลักฐาน (EvidenceSlot) ──
  evidenceUploadFailed: "อัปโหลดไม่สำเร็จ",
  evidenceNoImage: "ไม่มีรูป",
  evidenceLabelPrefix: "หลักฐาน{label}",
  evidenceMustMatch: "ต้องตรงกับ {amount}",
  evidenceNotAttached: "ยังไม่แนบ",
  evidenceSending: "กำลังส่ง…",
  evidenceChangeImage: "เปลี่ยนรูป",
  evidenceAttachImage: "แนบรูป",
  evidenceLabelQr: "สรุปยอด QR เข้าบัญชี",
  evidenceLabelGrab: "สรุปยอด Grab",
  evidenceLabelLineman: "สรุปยอด Lineman",

  // ── ช่องแนบรูปรายงาน POS (PosReportSlot) ──
  posCheckTitle: "ตรวจกับรายงานใน POS iPad",
  posCheckBody: "เปิดหน้า “รายงาน” ของวันนี้บน POS แล้วถ่ายรูปมาแนบ — ระบบอ่านยอดกับวันที่ในรูปให้เอง",
  posImageAlt: "รายงาน POS",
  posAttachFailed: "แนบรูปไม่สำเร็จ",
  posReadingImage: "กำลังอ่านรูป…",
  posReattachButton: "แนบรูปใหม่",
  posAttachButton: "📷 แนบรูปหน้ารายงาน POS",
  posStaleTitle: "ยอดที่กรอกเปลี่ยนหลังแนบรูป",
  posStaleBody: "ตอนแนบตรวจกับยอด {before} แต่ตอนนี้กรอกรวม {after} — แนบรูปใหม่เพื่อตรวจอีกครั้ง",
  posMatchOkTitle: "ข้อมูลถูกต้อง ✓",
  posMatchOkBody: "ตรงกับรายงาน POS ทั้งยอดรวมและเงินสด",
  posMatchOkImageAmount: " · ยอดในรูป {amount}",
  posMatchOkBillCount: " · {n} บิล",
  posUnclearTitle: "อ่านรูปไม่ชัด",
  posMismatchTitle: "ไม่ตรงกับรายงาน POS",
  posRecheckDefault: "ตรวจสอบตัวเลขที่กรอกอีกครั้ง",

  // ── คำถามยอดต่อเคส (AMOUNT_LABEL) ──
  amountLabelOverNoChange: "ลูกค้าโอนเกินกี่บาท (ไม่ได้ทอนคืน)",
  amountLabelOverCashChange: "คืนเงินสดให้ลูกค้ากี่บาท",
  amountLabelUnderCashTopup: "ลูกค้าจ่ายสดเพิ่มกี่บาท",
  amountLabelMenuChangeRefund: "คืนเงินสดให้ลูกค้ากี่บาท",
  amountLabelVoidFullRefund: "คืนเงินสดให้ลูกค้ากี่บาท (เท่ากับยอดที่โอนมา)",

  // ── ประเภทเคสรับเงินไม่ตรงบิล (INCIDENT_KINDS) ──
  incidentOverNoChangeLabel: "โอนเกิน · ไม่ได้ทอนคืน",
  incidentOverNoChangeHint: "ส่วนเกินนับเป็นรายได้ของร้าน",
  incidentOverCashChangeLabel: "โอนเกิน · ทอนเป็นเงินสด",
  incidentOverCashChangeHint: "หยิบเงินสดในลิ้นชักคืนลูกค้า",
  incidentUnderCashTopupLabel: "โอนขาด · จ่ายสดเพิ่ม",
  incidentUnderCashTopupHint: "โอนไม่ครบ แล้วจ่ายส่วนต่างเป็นเงินสด",
  incidentVoidFullRefundLabel: "ลูกค้ายกเลิกทั้งบิล · คืนสดเต็มจำนวน",
  incidentVoidFullRefundHint: "โอนมาแล้วไม่เอาเลย — void บิลออกจาก POS แล้วคืนเงินสดทั้งก้อน กรอกแค่ยอดที่โอนมา",
  incidentMenuChangeRefundLabel: "void บิล/เปลี่ยนเมนู · คืนสดจากลิ้นชัก",
  incidentMenuChangeRefundHint:
    "โอนมาแล้ว void บิลเก่า คีย์บิลใหม่ที่ถูกลง แล้วคืนส่วนต่างเป็นเงินสด · ยกเลิกทั้งบิลใส่ยอดบิลใหม่ = 0",

  // ── หน้าเพจ: สาขา/วันที่ ──
  dateLabel: "วันที่",

  // ── In-store ──
  inStoreTitle: "In-store (หน้าร้าน)",
  totalBadge: "รวม {amount}",
  cashLabel: "เงินสด",
  edcLabel: "EDC บัตร",
  posHintPrefix: "ทุกช่องกรอกตามที่ ",
  posHintSuffix: " สรุปเท่านั้น",
  posHintSub: "หากมีเคสโอนขาด/โอนเกิน/คืนเงินสด ระบบจะคำนวณให้อัตโนมัติ กดเพิ่มเคสด้านล่างได้เลย",

  // ── เคสรับเงินไม่ตรงบิล ──
  incidentSectionTitle: "รับเงินไม่ตรงบิล",
  incidentSectionSubtitle: "กดเมื่อมีเคสลูกค้าโอนเกิน/ขาด",
  incidentBaseHint: "ทุกเคสที่โอนขาด/เกิน คำนวณจากยอด QR — ถ้าช่อง QR ว่าง ค่าจะเพี้ยน",
  incidentAddButton: "+ เพิ่มเคส",
  incidentNeedQrPrefix: "กรอกยอด ",
  incidentNeedQrSuffix: " ด้านบนตาม POS ก่อน ถึงจะเพิ่มเคสได้",
  incidentNeedQrSub: "เพราะเคสทุกแบบคิดจากยอด QR เป็นฐาน — ถ้าฐานยังว่าง ยอดเงินเข้าจริงจะเพี้ยน",
  incidentRemoveButton: "ลบ",
  incidentAmountPlaceholder: "เช่น 129",
  incidentAdjustQr: "ระบบจะปรับให้: ยอด QR {amount}",
  incidentAdjustCash: " · เงินสดในลิ้นชัก {amount}",
  incidentAdjustOverBill: " · เกินบิล {amount} (นับเป็นรายได้ร้าน)",

  actualAmountTitle: "ยอดเงินเข้าจริง — ต้องตรงกับแอปธนาคาร",
  actualQrLabel: "QR",
  actualQrPosNote: "(POS {amount})",
  actualCashLabel: "เงินสดในลิ้นชัก",
  overBillTotal: "เกินบิลรวม {amount} (นับเป็นรายได้ร้าน)",
  actualAmountFooter: "เอาเลขนี้ไปเทียบกับยอดในแอปธนาคาร ถ้าไม่ตรง แปลว่ายังมีเคสที่ยังไม่ได้บันทึก",

  saveIncidentsButton: "บันทึกเคส (ทำก่อนแนบหลักฐาน)",
  incidentsSavedButton: "✓ บันทึกเคสแล้ว",
  incidentsDirtyWarning: "ยังไม่ได้บันทึกเคส — แนบหลักฐานตอนนี้ยอดอาจไม่ตรง",
  saveIncidentsFailed: "บันทึกเคสไม่สำเร็จ",
  tryAgain: "ลองใหม่อีกครั้ง",
  incidentsDirtyEvidenceLock: "กดปุ่ม “บันทึกเคส” ด้านบนก่อน แล้วช่องแนบหลักฐาน QR จะเปิดให้ใช้",
  incidentsDirtyEvidenceLockSub: "เพราะยอดที่ใช้เทียบสลิปต้องรวมผลของเคสแล้ว",

  // ── Delivery ──
  deliveryTitle: "Delivery",

  // ── รวมทั้งวัน / ตรวจ POS ──
  statTotalToday: "รวมทั้งวัน",

  // ── missing evidence ──
  missingEvidenceQr: "สรุปยอด QR",
  missingEvidencePos: "รายงานยอดขาย POS",
  missingEvidenceAlert: "ยังไม่ได้แนบหลักฐาน: {list}",

  // ── บันทึกยอดขาย ──
  loadFailed: "โหลดข้อมูลไม่สำเร็จ",
  saveFailedGeneric: "บันทึกไม่สำเร็จ",
  savedSuccessTitle: "บันทึกยอดขายสำเร็จ",
  savedSuccessBody: "สาขา {branch} · {date} · รวมทั้งวัน {amount}",
  saveStillFailedTitle: "ยังบันทึกไม่สำเร็จ",
  saveAgainPrompt: "ลองกดบันทึกอีกครั้ง",
  saveSalesButton: "บันทึกยอดขาย",

  // ── popup หลังตรวจรูปรายงาน POS ──
  posMatchOkDialogTitle: "ตรวจแล้ว ข้อมูลถูกต้อง ✓",
  posMatchOkDialogBody: "เหลืออีกขั้นเดียว — ยังไม่ได้บันทึกยอดขายของวันนี้",
  posMatchOkDialogAction: "บันทึกยอดขายเลย",
  posMatchOkDialogSecondary: "ไว้ก่อน",
  posMismatchDialogTitle: "ยอดยังไม่ตรงกับรายงาน POS",
  posMismatchDialogBody: "ตรวจตัวเลขที่กรอกอีกครั้ง แล้วแนบรูปใหม่",
  posMismatchDialogAction: "กลับไปแก้ตัวเลข",

  dialogOkClose: "เรียบร้อย",
  dialogWarnClose: "ปิด",

  // ── /api/sales, /api/sales/pos-report, /api/sales/incidents, /api/sales-evidence ──
  errInvalidDate: "date ไม่ถูกต้อง (YYYY-MM-DD)",
  errInvalidRow: "row ไม่ถูกต้อง",
  errUnsupportedImageType: "รองรับเฉพาะ JPEG/PNG/WebP",
  errNoImageAttached: "ไม่มีรูปแนบ",
  errInvalidType: "type ไม่ถูกต้อง ({types})",
};
