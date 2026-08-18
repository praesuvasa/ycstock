// /stock — กรอกสต็อกรายวัน (client page, ~1200 บรรทัด) + /api/stock (server-side error strings)
// ห้ามแปลชื่อสินค้า/หมวดที่มาจาก meta.items/meta.par (ข้อมูลจริงจากฐานข้อมูล) — เฉพาะข้อความ UI ของหน้านี้เอง
export const th = {
  pageTitle: "กรอกสต็อกรายวัน",
  notToday: "⚠️ ไม่ใช่วันนี้ — {date}",
  startButton: "ยืนยัน แล้วเริ่มนับสต็อก",

  receiptPendingTodayTitle: "กรุณากดยืนยันรับสินค้าเข้าก่อนเช็คสต็อก",
  receiptPendingTodayBody:
    "ยังไม่ได้ยืนยัน {n} รายการของวันนี้ — ถ้ายังไม่ยืนยัน ช่อง “รับเข้า” จะว่าง แล้วยอดคงเหลือที่นับได้จะดูเหมือนเกินของที่มี",
  goConfirmReceipt: "ไปยืนยันรับสินค้า →",

  oldPendingSheets: "มีใบเก่าค้างยืนยันอีก {n} รายการ",
  oldestPendingSuffix: " (เก่าสุด {date})",
  oldPendingBody:
    "ควรเคลียร์ให้จบ เหลือแต่ใบล่าสุด — ถ้าของไม่ได้มาจริง ปิดทั้งใบว่า “ไม่ได้รับ” ได้เลย แล้วระบบจะแจ้งแอดมินให้เอง",
  oldPendingSub:
    "ยิ่งค้างนานยิ่งเพี้ยน — กดยืนยันวันไหน ยอดจะไปลง “รับเข้า” ของวันนั้น ไม่ใช่วันที่ของถึงจริง",
  goManagePending: "ไปจัดการใบค้าง",

  preStartHintLine1: "ตรวจสาขาและวันที่ด้านบนให้ถูกก่อน",
  preStartHintLine2: "แล้วกด “ยืนยัน แล้วเริ่มนับสต็อก” เพื่อดู/กรอกรายการ",

  receiptPendingBanner: "⚠️ กรุณายืนยันรับของก่อนนับสต็อก",
  goConfirmReceiptShort: "ไปยืนยันรับของ",

  confirmedCountLabel: "ยืนยันแล้ว",
  pendingCountLabel: "ค้าง",
  errorCountLabel: "⚠️ เกิน/ผิด {n}",

  hiddenShownBanner: "กำลังแสดง {n} รายการที่ไม่ถึงรอบเช็ค — กรอกได้ปกติถ้ามีของเข้า",
  hiddenHiddenBanner: "ซ่อนไว้ {n} รายการที่ไม่ถึงรอบเช็ควันนี้ — ถ้ามีของเข้านอกใบยืนยันรับของ กดเพื่อกรอก",
  hideAction: "ซ่อน",
  showListAction: "แสดงรายการ",

  loadErrorPrefix: "โหลดข้อมูลไม่สำเร็จ: {err}",
  emptyForBranch: "ไม่มีรายการสต็อกสำหรับสาขานี้",

  hiddenStartMarker: "↓ รายการที่ไม่ถึงรอบเช็ควันนี้ — กรอกรับเข้าได้เลย",
  hiddenCategoryBadge: "ยังไม่ถึงรอบเช็ค กรอกรับเข้า",
  incompleteCategoryBadge: "กรอกไม่ครบ",
  itemCountSuffix: "{n} รายการ",
  subGroupNotFilled: "ยังไม่กรอก {n}",

  confirmedToCarryWithG: "✓ เท่ายกมา ({pack} แพ็ค + {g} {unit})",
  confirmedToCarry: "✓ เท่ายกมา ({pack} แพ็ค)",

  transferOutNote: "↗ แกะไปรวมกับ {name} · {qty} {unit}",
  transferOutSub: "(ไม่นับเป็นยอดขาย)",
  transferInNote: "↘ ได้จากการแกะ {name} · +{amount}",
  transferInSub: "(ระบบนับให้แล้ว ไม่ต้องกรอกรับเข้า)",
  transferFallbackItem: "รายการอื่น",

  unitBox: "กล่อง",
  unitPack: "แพ็ค",
  unitGram: "กรัม",
  unitPiece: "ชิ้น",
  boxUnitTooltip: "1 {unit} = {n} {su}",

  labelCarry: "ยกมา",
  labelIn: "รับเข้า",
  labelOutUsedAlt: "แกะ/ออก",
  labelOutUsed: "ขาย/ใช้",
  labelRemain: "คงเหลือ",

  invalidQtyWarning: "⚠️ จำนวนผิด",

  labelReturned: "ส่งคืน/เสีย",
  labelReturnedG: "ส่งคืนเศษ ({unit})",
  labelReturnNote: "หมายเหตุ (ส่งคืน/เสีย)",
  returnNotePlaceholder: "เหตุผล เช่น หมดอายุ / แตก",
  addReturnButton: "+ ส่งคืน/เสีย",

  remainderGroupTooltip: "เศษรวมกลุ่ม {group} — กรอกที่รายการนี้ที่เดียว",
  labelCarryG: "ยกมา g",
  labelInG: "รับเข้า g",
  labelRemainG: "เศษคงเหลือ g",
  remainderGroupLinked: "🔗 เศษรวมกลุ่ม {group} — กรอกที่ “{leader}”",

  cupOpenTooltip: "ถ้วยเปิดแพ็ค",
  labelCarryUnit: "ยกมา {unit}",
  labelInUnit: "รับเข้า {unit}",
  labelOutUnit: "ขาย/ใช้ {unit}",
  labelRemainUnit: "คงเหลือ {unit}",

  groupOverWarning: "⚠️ เศษรวมกลุ่ม {group} เกินของที่มี (เกิน {n} g)",
  groupOkSummary: "✓ กลุ่ม {group}: ใช้ไปรวม {used} g · คงเหลือรวม {remain} g (มี {avail} g)",
  overWarning: "⚠️ คงเหลือรวมเกินของที่มี (เกิน {n} {unit}){packSuffix}",
  overWarningPackSuffix: " ≈ {n} แพ็ค",
  cupSummaryLine: "📊 รวมทั้งหมด {remain} ชิ้น (บันทึกวันนี้) · ใช้/ขาย {used} ชิ้น — กระทบยอดที่หน้า “ถ้วย”",
  hasRemainderOkSummary: "✓ รวมใช้ไป {used} {unit} · คงเหลือรวม {remain} {unit} (มี {avail} {unit})",
  varianceWarning: "⚠️ ยอดไม่ตรง (ต่าง {sign}{n})",
  soldReturnedSummary: "✓ ขาย {used} · ส่งคืน {returned} {unit}",

  ownCupTitle: "ลูกค้าเอาแก้วมาเอง",
  ownCupSubtitle: "— บิลที่ไม่ได้ใช้ถ้วยของร้าน",
  ownCupAddButton: "+ ลูกค้าเอาแก้วมาเอง (กดถ้ามี)",

  packAdjustTitle: "เปิดแพคแล้วนับได้ไม่ตรง",
  packAdjustSub: "ใส่ส่วนต่างเป็นชิ้น — เกินใส่ 2 · ขาดใส่ -1 · ระบบจะแจ้งแอดมินให้เอง",
  packAdjustAddButton: "+ แพคถ้วยไม่ครบ/เกิน (กดเมื่อเจอ)",

  cupTotalLabel: "🥤 รวมแก้วทุกขนาดที่ใช้ไปวันนี้",
  cupTotalUnit: "ชิ้น",

  saveBarIncomplete: "⚠️ ยังไม่ครบ — เหลือ {n} รายการที่ยังไม่ยืนยัน/กรอก",
  saveBarComplete: "✓ ครบทุกรายการแล้ว พร้อมบันทึก",
  saveButton: "บันทึกสต็อกวันนี้",

  savedTitle: "บันทึกสต็อกสำเร็จ",
  savedSubtitle: "สาขา {branch} · {date}",
  goToSalesButton: "ไปบันทึกรายงานยอดขาย →",
  closeButton: "ปิด",

  saveErrorConfirmPrefix: "มี {n} รายการที่ยอดไม่ตรง/คงเหลือเกินของที่มี",
  saveErrorConfirmSuffix: "ต้องการบันทึกเลยไหม?",
  saveErrorMoreItems: "และอีก {n} รายการ",
  errorItemOverQty: "{name} — เกิน {n} {unit}",
  errorItemVarianceMismatch: "{name} — ยอดไม่ตรง (ต่าง {sign}{n})",
  errorGroupOver: "กลุ่ม {group} — เกิน {n} g",

  conflictSavedBy: "{who} บันทึกสต็อกของวันนี้ไปแล้ว",
  conflictSavedAtSuffix: " เมื่อ {time} น.",
  conflictConfirmBody:
    "กด “ตกลง” = บันทึกทับด้วยตัวเลขที่คุณกรอก (ตัวเลขของ {who} จะหายไป)\nกด “ยกเลิก” = ไม่บันทึก แล้วโหลดหน้าใหม่เพื่อดูตัวเลขล่าสุดก่อน",
  conflictOtherPerson: "คนอื่น",
  conflictCancelAlert: "ยังไม่ได้บันทึก — กดรีเฟรชหน้าเพื่อดูตัวเลขล่าสุดก่อนกรอกต่อ",

  saveFailedGeneric: "บันทึกไม่สำเร็จ",
  saveFailedPrefix: "บันทึกไม่สำเร็จ: {msg}",

  // ── sub-component: RemainCell (ยังไม่ยืนยัน / แก้ไข) ──
  confirmPrompt: "ยืนยัน?",
  editLink: "แก้ไข",

  // ── module-level constant → labelKey (COLLAPSIBLE_SUBGROUPS) ──
  subGroupGlovesLabel: "ถุงมือ",

  // ── /api/stock ──
  errDateRequired: "date จำเป็น",
  errRowsRequired: "rows จำเป็น",
  errConflictAfterOpen: "{who} บันทึกสต็อกของวันนี้ไปแล้วหลังจากที่คุณเปิดหน้านี้",
};
