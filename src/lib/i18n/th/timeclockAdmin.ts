// /timeclock-admin — ตั้งค่าระบบลงเวลา (แอดมินเท่านั้น) + /api/time-clock/settings
export const th = {
  saved: "บันทึกแล้ว",
  saveFailed: "บันทึกไม่สำเร็จ",
  loading: "กำลังโหลด…",

  geoNotSupported: "เครื่องนี้ไม่รองรับการอ่านตำแหน่ง",
  geoSetMsg: "ตั้งพิกัดสาขา {branch} แล้ว (แม่นยำ ±{accuracy} ม.)",
  geoReadFailed: "อ่านตำแหน่งไม่ได้ — กดอนุญาตให้เบราว์เซอร์ใช้ตำแหน่งก่อน",
  radiusUpdatedMsg: "อัปเดตรัศมีสาขา {branch} แล้ว",

  sectionMenusTitle: "เมนูที่เปิดให้พนักงานใช้",
  toggleExpiryLabel: "ตรวจสอบวันหมดอายุ",
  toggleExpiryHint: "ปิดอยู่ = ไม่มีเมนูนี้ ไม่มีในเช็คลิสต์งานวันนี้ และไม่มีเลขเตือน · ของที่ต้องส่งคืนให้กรอกที่หน้า “ส่งคืน” ตามเดิม",
  toggleStaffTimeLabel: "เมนูลงเวลา + ตารางงาน (ของพนักงาน)",
  toggleStaffTimeHint: "ปิดอยู่ = พนักงานไม่เห็น 2 เมนูนี้เลย · แอดมินยังเห็นและทดสอบได้ตลอด · เปิดวันที่สร้างบัญชีและให้ทุกคนลงทะเบียนใบหน้าแล้ว",

  sectionTimeClockTitle: "ลงเวลาเข้า-ออกงาน",
  toggleEnabledLabel: "เปิดให้พนักงานลงเวลา",
  toggleEnabledHint: "ปิดอยู่ = พนักงานยังลงทะเบียนใบหน้าได้ แต่กดเข้า-ออกงานไม่ได้",
  toggleRequireFaceLabel: "บังคับสแกนใบหน้า",
  toggleRequireFaceHint: "ปิดแล้วจะกดลงเวลาได้เลยโดยไม่ต้องถ่ายหน้า — ลงเวลาแทนกันได้ทันที ไม่แนะนำให้ปิด",
  toggleRequireLocationLabel: "บังคับให้อยู่ในรัศมีร้าน",
  toggleRequireLocationHint: "ต้องตั้งพิกัดร้านของสาขานั้นก่อน ไม่งั้นพนักงานสาขานั้นจะลงเวลาไม่ได้เลย",

  sectionGeoTitle: "พิกัดร้าน",
  geoSectionHint: "กด “ใช้ตำแหน่งปัจจุบัน” ตอนยืนอยู่ที่ร้านสาขานั้น · รัศมีแนะนำ 150 ม. เผื่อความคลาดเคลื่อนของ GPS ในอาคาร (ห้างมักจับตำแหน่งเพี้ยนได้หลายสิบเมตร)",
  geoSetBadge: "ตั้งแล้ว",
  geoNotSetBadge: "ยังไม่ได้ตั้ง",
  metersUnit: "เมตร",
  saveRadiusBtn: "บันทึกรัศมี",
  useHereBtn: "ใช้ตำแหน่งปัจจุบัน",

  footerNote: "ถ้าไม่ได้ไปที่ร้าน: เปิด Google Maps ที่หน้าร้าน กดค้างบนแผนที่จะได้พิกัด แล้วบอกผมได้ ผมใส่ให้",

  errBranchRequired: "ต้องระบุสาขา",
  errInvalidGeo: "พิกัดไม่ถูกต้อง",
};
