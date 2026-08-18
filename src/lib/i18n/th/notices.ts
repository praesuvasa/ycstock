// /notices — หน้าประกาศพิเศษ (admin) + /api/notices, /api/notices/[id]
export const th = {
  title: "ประกาศพิเศษ",
  adminOnly: "เฉพาะ Admin เท่านั้น",
  allBranches: "ทุกสาขา",
  branchBadgePrefix: "สาขา ",
  addTitle: "เพิ่มประกาศ",
  hint: 'ใช้แจ้งเตือนกรณีของเข้าไม่ตรงรอบปกติ เช่น วันหยุดพนักงานส่งของ หรือวันหยุดเฉพาะสาขา — ข้อความจะโชว์ที่หน้า "ขอเบิกสินค้า" ของสาขาที่เลือก จนกว่าจะกดปิด',
  targetBranchLabel: "ประกาศไปที่สาขา",
  messageLabel: "ข้อความ",
  messagePlaceholder: "เช่น สัปดาห์นี้ของเข้าช้า 1 วัน เนื่องจากพนักงานส่งของลา",
  addButton: "เพิ่มประกาศ",
  emptyMessageError: "กรอกข้อความประกาศ",
  loadFailedFallback: "โหลดไม่สำเร็จ",
  createFailedFallback: "สร้างไม่สำเร็จ",
  deleteConfirm: "ปิดประกาศนี้?",
  deleteFailedFallback: "ลบไม่สำเร็จ",
  closing: "กำลังปิด…",
  closeButton: "ปิดประกาศ",
  emptyState: "ยังไม่มีประกาศ",
  // ── server-side (API routes ใช้ session.lang) ──
  errMessageRequired: "ต้องระบุข้อความ",
  errInvalidBranch: "สาขาไม่ถูกต้อง",
};
