// /users — จัดการผู้ใช้ (admin เท่านั้น) + /api/users error strings
export const th = {
  pageTitle: "จัดการผู้ใช้",
  adminOnly: "เฉพาะ Admin เท่านั้น",

  // ตัวเลือกสิทธิ์ (role) — ใช้ทั้งฟอร์มเพิ่มผู้ใช้และ badge ต่อแถว
  roleUser: "พนักงาน",
  roleRestock: "จนท. Restock",
  roleAdmin: "ผู้ดูแล",

  // หน่วยงาน (v1.24)
  unitStore: "หน้าร้าน",
  unitProduction: "ฝ่ายผลิต",

  allBranches: "ทุกสาขา",

  // ภาษา UI (v1.31)
  langTh: "ไทย",
  langEn: "English",

  errLoadFailed: "โหลดไม่สำเร็จ",
  errSaveFailed: "บันทึกไม่สำเร็จ",
  errNameRequired: "กรอกชื่อ",
  errCreateFailed: "สร้างไม่สำเร็จ",
  errNameMismatch: "ชื่อที่พิมพ์ไม่ตรง — ยกเลิกการลบ",
  errDeleteFailed: "ลบไม่สำเร็จ",
  errResetFaceFailed: "รีเซ็ตไม่สำเร็จ",
  errIssueCodeFailed: "ออกรหัสไม่สำเร็จ",

  deleteConfirmPrompt:
    "ลบบัญชี \"{name}\" ถาวร — กู้คืนไม่ได้\n\nถ้าแค่ให้เขาเข้าระบบไม่ได้ ใช้ \"ปิดการใช้งาน\" ดีกว่า (ประวัติยังอยู่ครบ)\n\nยืนยันโดยพิมพ์ชื่อให้ตรง:",
  resetFaceConfirm:
    "รีเซ็ตใบหน้าของ {name}?\n\nใบหน้าเดิมจะถูกลบ และเจ้าตัวต้องลงทะเบียนใหม่เองก่อนถึงจะลงเวลาได้อีก",
  resetFaceDoneAlert:
    "รีเซ็ตใบหน้าของ {name} แล้ว — ให้เจ้าตัวเข้าเมนู \"ลงเวลาเข้า-ออกงาน\" แล้วลงทะเบียนใหม่",
  issueSetupCodeConfirm:
    "ออกรหัสตั้งค่าใหม่ให้ {name}?\n\nรหัสเดิมของเขาจะใช้เข้าระบบไม่ได้ทันที และต้องเอารหัสใหม่ไปตั้งรหัสเองก่อนถึงจะใช้งานต่อได้",

  issuedCodeOf: "รหัสตั้งค่าของ",
  issuedCodeWarningLine1: "ส่งให้เจ้าตัวเดี๋ยวนี้ — ปิดหน้านี้แล้วดูย้อนหลังไม่ได้ (ระบบเก็บเป็นค่าเข้ารหัส)",
  issuedCodeWarningLine2: "ใช้เข้าระบบได้ครั้งเดียว หมดอายุใน 48 ชั่วโมง",
  issuedCodeDismiss: "ส่งให้เรียบร้อยแล้ว — ปิด",

  addUserTitle: "เพิ่มผู้ใช้",
  nameLabel: "ชื่อ",
  namePlaceholder: "ชื่อพนักงาน",
  setupCodeInfoPre: "ไม่ต้องตั้งรหัสให้ — ระบบจะออก",
  setupCodeInfoBold: "รหัสตั้งค่า",
  setupCodeInfoPost: "6 หลักให้ส่งต่อ แล้วเจ้าตัวเข้าครั้งแรกเพื่อตั้งรหัสของตัวเอง (คุณจะไม่รู้รหัสจริงของเขา)",
  roleFieldLabel: "สิทธิ์",
  branchFieldLabel: "สาขา",
  creatingBtn: "กำลังสร้าง…",
  createUserBtn: "สร้างผู้ใช้",

  loadingText: "กำลังโหลด…",
  noUsersText: "ยังไม่มีผู้ใช้",

  editNamePrompt: "แก้ชื่อของ \"{name}\"",
  editNameBtn: "แก้ชื่อ",
  statusActive: "ใช้งาน",
  statusInactive: "ปิด",
  mustSetPasscodeBadge: "ยังไม่ได้ตั้งรหัส",

  unitFieldLabel: "หน่วยงาน",
  seniorDescription: "senior staff — แก้ตารางกะของสาขาตัวเองได้ (ทุกการแก้แจ้งแอดมิน)",
  seniorOptNo: "พนักงานทั่วไป",
  seniorOptYes: "senior staff",
  uiLangFieldLabel: "ภาษา UI",

  allowanceTitle: "สิทธิ์ซื้อของในร้าน",
  allowanceEnabledDetail: "฿{amount}/เดือน · เห็นเมนูนี้",
  allowanceDisabledDetail: "ยังไม่ได้รับสิทธิ์ · ไม่เห็นเมนู",
  allowanceOnBtn: "เปิดอยู่",
  allowanceOffBtn: "เปิดสิทธิ์",

  disableUserBtn: "ปิดการใช้งาน",
  enableUserBtn: "เปิดใช้งาน",
  issueNewCodeBtn: "ออกรหัสตั้งค่าใหม่",
  resetFaceBtn: "รีเซ็ตใบหน้า (ให้ลงทะเบียนใหม่)",
  deleteUserBtn: "ลบบัญชีถาวร",

  // /api/users
  errNameRequiredApi: "ต้องระบุชื่อ",
  errInvalidRole: "role ไม่ถูกต้อง ({roles})",
  errInvalidBranchScope: "สาขาไม่ถูกต้อง ({scopes})",
  errIdRequired: "ต้องระบุ id",
  errInvalidAllowanceAmount: "วงเงินไม่ถูกต้อง",
  errUserNotFound: "ไม่พบผู้ใช้",
  errCannotDeleteSelf: "ลบบัญชีตัวเองไม่ได้",
  errCannotDeleteAdmin: "ลบบัญชีแอดมินไม่ได้ — ใช้ \"ปิดการใช้งาน\" หรือเปลี่ยนสิทธิ์เป็นพนักงานก่อนถ้าต้องการลบจริง",
  errHasAllowanceHistory: "บัญชีนี้มีประวัติใช้สิทธิ์ซื้อของ {count} รายการ ลบไม่ได้ — ใช้ \"ปิดการใช้งาน\" แทน",
  errDeleteFailedApi: "ลบไม่สำเร็จ",
};
