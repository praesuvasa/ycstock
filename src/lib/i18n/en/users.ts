import type { th } from "../th/users";

export const en: typeof th = {
  pageTitle: "Manage Users",
  adminOnly: "Admin only",

  roleUser: "Staff",
  roleRestock: "Restock officer",
  roleAdmin: "Admin",

  unitStore: "Store",
  unitProduction: "Production",

  allBranches: "All branches",

  langTh: "Thai",
  langEn: "English",

  errLoadFailed: "Failed to load",
  errSaveFailed: "Failed to save",
  errNameRequired: "Enter a name",
  errCreateFailed: "Failed to create",
  errNameMismatch: "Name doesn't match — deletion cancelled",
  errDeleteFailed: "Failed to delete",
  errResetFaceFailed: "Reset failed",
  errIssueCodeFailed: "Failed to issue code",

  deleteConfirmPrompt:
    "Permanently delete the account \"{name}\" — this can't be undone\n\nIf you just want to block their login, use \"Disable\" instead (history stays intact)\n\nConfirm by typing the name exactly:",
  resetFaceConfirm:
    "Reset {name}'s face?\n\nTheir existing face will be deleted, and they'll need to re-enroll themselves before they can clock in again.",
  resetFaceDoneAlert:
    "Reset {name}'s face — have them go to the \"Clock in / out\" menu and re-enroll.",
  issueSetupCodeConfirm:
    "Issue a new setup code for {name}?\n\nTheir old code will stop working immediately, and they'll need to use the new code to set their own password before they can use the app again.",

  issuedCodeOf: "Setup code for",
  issuedCodeWarningLine1: "Send it to them right now — this page can't be reopened once closed (only an encrypted value is stored)",
  issuedCodeWarningLine2: "One-time use, expires in 48 hours",
  issuedCodeDismiss: "Sent it — close",

  addUserTitle: "Add user",
  nameLabel: "Name",
  namePlaceholder: "Staff name",
  setupCodeInfoPre: "No need to set a password — the system will issue a",
  setupCodeInfoBold: "setup code",
  setupCodeInfoPost: "(6 digits) to pass along, and they'll set their own password the first time they log in (you won't know their real password).",
  roleFieldLabel: "Role",
  branchFieldLabel: "Branch",
  creatingBtn: "Creating…",
  createUserBtn: "Create user",

  loadingText: "Loading…",
  noUsersText: "No users yet",

  editNamePrompt: "Edit {name}'s name",
  editNameBtn: "Edit name",
  statusActive: "Active",
  statusInactive: "Disabled",
  mustSetPasscodeBadge: "Password not set yet",

  unitFieldLabel: "Unit",
  seniorDescription: "senior staff — can edit their branch's schedule (every edit notifies the admin)",
  seniorOptNo: "Regular staff",
  seniorOptYes: "senior staff",
  uiLangFieldLabel: "UI language",

  allowanceTitle: "In-store purchase allowance",
  allowanceEnabledDetail: "฿{amount}/month · menu visible",
  allowanceDisabledDetail: "Not granted yet · menu hidden",
  allowanceOnBtn: "On",
  allowanceOffBtn: "Enable",

  disableUserBtn: "Disable",
  enableUserBtn: "Enable",
  issueNewCodeBtn: "Issue new setup code",
  resetFaceBtn: "Reset face (re-enroll)",
  deleteUserBtn: "Delete account permanently",

  // /api/users
  errNameRequiredApi: "Name is required",
  errInvalidRole: "Invalid role ({roles})",
  errInvalidBranchScope: "Invalid branch ({scopes})",
  errIdRequired: "id is required",
  errInvalidAllowanceAmount: "Invalid allowance amount",
  errUserNotFound: "User not found",
  errCannotDeleteSelf: "You can't delete your own account",
  errCannotDeleteAdmin: "Admin accounts can't be deleted — use \"Disable\" or change the role to Staff first if you really need to delete it",
  errHasAllowanceHistory: "This account has {count} purchase-allowance record(s) — can't be deleted, use \"Disable\" instead",
  errDeleteFailedApi: "Failed to delete",
};
