// /timeclock-report — รายงานชั่วโมงทำงานรายเดือน (แอดมินเท่านั้น) + API /api/time-clock/report
export const th = {
  monthLabel: "เดือน",
  allBranches: "ทุกสาขา",
  loadingText: "กำลังโหลด…",

  summaryTitle: "สรุปรายคน",
  totalMonthLabel: "รวมทั้งเดือน {value}",
  summaryEmptyState: "เดือนนี้ยังไม่มีใครลงเวลา",
  daysShiftsLabel: "{days} วัน · {shifts} กะ",
  openShiftsSuffix: " · ยังไม่กดออกงาน {n}",

  dailyTitle: "รายวัน",
  productionUnit: "ฝ่ายผลิต",
  notClockedOutYet: "ยังไม่ออก",
  editedByBadge: "แก้โดย {name}",
  faceScanBadge: "สแกนหน้า {pct}%",
  distanceBadge: "ห่างร้าน {m} ม.",
  editTimeButton: "แก้เวลา",
  editNotePrefix: "เหตุผล: {note}",
  emptyMonthState: "ไม่มีข้อมูลในเดือนนี้",

  durationHoursOnly: "{h} ชม.",
  durationHoursMinutes: "{h} ชม. {m} น.",

  dialogTitle: "แก้เวลา · {name}",
  branchLabel: "สาขา {branch}",
  clockInLabel: "เข้างาน",
  clockOutLabel: "ออกงาน",
  overnightNote: "เวลาออกน้อยกว่าเวลาเข้า — ระบบจะนับเป็นข้ามคืนให้",
  reasonLabel: "เหตุผลที่แก้ (บังคับ)",
  reasonPlaceholder: "เช่น ลืมกดออกงาน · ปิดร้าน 21:00",
  errReasonRequiredClient: "เขียนเหตุผลที่แก้ด้วย",
  errSaveFailed: "บันทึกไม่สำเร็จ",
  cancelButton: "ยกเลิก",
  savingButton: "กำลังบันทึก…",
  saveButton: "บันทึก",
  editFooterNote: "การแก้จะถูกบันทึกไว้ว่าใครแก้และเพราะอะไร · ขึ้นป้าย “แก้แล้ว” ที่รายการนั้นตลอด",

  // API /api/time-clock/report
  errInvalidMonth: "month ไม่ถูกต้อง (YYYY-MM)",
  errIdRequired: "ต้องระบุ id",
  errNoteRequired: "ต้องเขียนเหตุผลที่แก้ (อย่างน้อย 3 ตัวอักษร)",
  errClockInInvalid: "เวลาเข้างานไม่ถูกต้อง",
  errClockOutInvalid: "เวลาออกงานไม่ถูกต้อง",
  errClockOutAfterClockIn: "เวลาออกงานต้องหลังเวลาเข้างาน",
};
