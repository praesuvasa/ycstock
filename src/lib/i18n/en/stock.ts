import type { th } from "../th/stock";

export const en: typeof th = {
  pageTitle: "Daily Stock Count",
  notToday: "⚠️ Not today — {date}",
  startButton: "Confirm and start counting",

  receiptPendingTodayTitle: "Please confirm today's deliveries before counting stock",
  receiptPendingTodayBody:
    "{n} item(s) from today are still unconfirmed — until confirmed, the “Stock in” field stays empty and the count will look like it's over what's on hand",
  goConfirmReceipt: "Go confirm delivery →",

  oldPendingSheets: "{n} older item(s) still awaiting confirmation",
  oldestPendingSuffix: " (oldest: {date})",
  oldPendingBody:
    "Best to clear these out so only the latest sheet is left — if something never actually arrived, close it out as “Not received” and the system will notify the admin",
  oldPendingSub:
    "The longer these sit, the more off things get — confirming on a given day logs it as “stock in” for that day, not the day it actually arrived",
  goManagePending: "Go manage pending sheets",

  preStartHintLine1: "Double-check the branch and date above first",
  preStartHintLine2: "then tap “Confirm and start counting” to view/enter items",

  receiptPendingBanner: "⚠️ Please confirm deliveries before counting stock",
  goConfirmReceiptShort: "Go confirm delivery",

  confirmedCountLabel: "Confirmed",
  pendingCountLabel: "Pending",
  errorCountLabel: "⚠️ Over/mismatched {n}",

  hiddenShownBanner: "Showing {n} item(s) not due for a check today — you can still enter them normally if stock came in",
  hiddenHiddenBanner: "{n} item(s) not due for a check today are hidden — tap to enter them if stock came in outside a delivery confirmation",
  hideAction: "Hide",
  showListAction: "Show items",

  loadErrorPrefix: "Failed to load data: {err}",
  emptyForBranch: "No stock items set up for this branch",

  hiddenStartMarker: "↓ Items not due for a check today — you can still log stock in",
  hiddenCategoryBadge: "Not due for a check yet — stock in only",
  incompleteCategoryBadge: "Not complete",
  itemCountSuffix: "{n} item(s)",
  subGroupNotFilled: "{n} not filled in",

  confirmedToCarryWithG: "✓ Same as carried over ({pack} pack + {g} {unit})",
  confirmedToCarry: "✓ Same as carried over ({pack} pack)",

  transferOutNote: "↗ Combined into {name} · {qty} {unit}",
  transferOutSub: "(not counted as a sale)",
  transferInNote: "↘ Received from combining {name} · +{amount}",
  transferInSub: "(already counted by the system — no need to log stock in)",
  transferFallbackItem: "another item",

  unitBox: "box",
  unitPack: "pack",
  unitGram: "gram",
  unitPiece: "piece",
  boxUnitTooltip: "1 {unit} = {n} {su}",

  labelCarry: "Carried over",
  labelIn: "Stock in",
  labelOutUsedAlt: "Opened/used",
  labelOutUsed: "Sold/used",
  labelRemain: "Remaining",

  invalidQtyWarning: "⚠️ Invalid quantity",

  labelReturned: "Returned/spoiled",
  labelReturnedG: "Returned leftover ({unit})",
  labelReturnNote: "Note (returned/spoiled)",
  returnNotePlaceholder: "Reason, e.g. expired / broken",
  addReturnButton: "+ Returned/spoiled",

  remainderGroupTooltip: "Shared leftover for group {group} — enter it on this item only",
  labelCarryG: "Carried g",
  labelInG: "Stock in g",
  labelRemainG: "Leftover remaining g",
  remainderGroupLinked: "🔗 Shared leftover for group {group} — enter it on “{leader}”",

  cupOpenTooltip: "Cup pack opened",
  labelCarryUnit: "Carried over {unit}",
  labelInUnit: "Stock in {unit}",
  labelOutUnit: "Sold/used {unit}",
  labelRemainUnit: "Remaining {unit}",

  groupOverWarning: "⚠️ Group {group}'s shared leftover exceeds what's on hand (over by {n} g)",
  groupOkSummary: "✓ Group {group}: used {used} g total · remaining {remain} g (had {avail} g)",
  overWarning: "⚠️ Remaining total exceeds what's on hand (over by {n} {unit}){packSuffix}",
  overWarningPackSuffix: " ≈ {n} pack(s)",
  cupSummaryLine: "📊 Total {remain} pieces (logged today) · sold/used {used} pieces — affects the “Cups” page",
  hasRemainderOkSummary: "✓ Used {used} {unit} total · remaining {remain} {unit} (had {avail} {unit})",
  varianceWarning: "⚠️ Doesn't balance (off by {sign}{n})",
  soldReturnedSummary: "✓ Sold {used} · returned {returned} {unit}",

  ownCupTitle: "Customer brought their own cup",
  ownCupSubtitle: "— bills that didn't use a store cup",
  ownCupAddButton: "+ Customer brought own cup (tap if any)",

  packAdjustTitle: "Pack count doesn't match after opening",
  packAdjustSub: "Enter the difference in pieces — over is +2, short is -1 — the system will notify the admin",
  packAdjustAddButton: "+ Cup pack short/over (tap when it happens)",

  cupTotalLabel: "🥤 Total cups used today, all sizes",
  cupTotalUnit: "pieces",

  saveBarIncomplete: "⚠️ Not complete — {n} item(s) still unconfirmed/unfilled",
  saveBarComplete: "✓ Everything's filled in — ready to save",
  saveButton: "Save today's stock",

  savedTitle: "Stock count saved",
  savedSubtitle: "Branch {branch} · {date}",
  goToSalesButton: "Go log sales report →",
  closeButton: "Close",

  saveErrorConfirmPrefix: "{n} item(s) don't balance or exceed what's on hand",
  saveErrorConfirmSuffix: "Save anyway?",
  saveErrorMoreItems: "and {n} more item(s)",
  errorItemOverQty: "{name} — over by {n} {unit}",
  errorItemVarianceMismatch: "{name} — doesn't balance (off by {sign}{n})",
  errorGroupOver: "Group {group} — over by {n} g",

  conflictSavedBy: "{who} already saved today's stock count",
  conflictSavedAtSuffix: " at {time}",
  conflictConfirmBody:
    "Tap “OK” to save over it with your numbers ({who}'s numbers will be lost)\nTap “Cancel” to skip saving and reload the page to see the latest numbers first",
  conflictOtherPerson: "Someone else",
  conflictCancelAlert: "Not saved — refresh the page to see the latest numbers before continuing",

  saveFailedGeneric: "Save failed",
  saveFailedPrefix: "Save failed: {msg}",

  // ── sub-component: RemainCell (unconfirmed / edit) ──
  confirmPrompt: "Confirm?",
  editLink: "Edit",

  // ── module-level constant → labelKey (COLLAPSIBLE_SUBGROUPS) ──
  subGroupGlovesLabel: "Gloves",

  // ── /api/stock ──
  errDateRequired: "date is required",
  errRowsRequired: "rows is required",
  errConflictAfterOpen: "{who} already saved today's stock count after you opened this page",
};
