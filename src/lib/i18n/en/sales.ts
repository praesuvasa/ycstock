import type { th } from "../th/sales";

export const en: typeof th = {
  // ── Evidence match status (MATCH_LABEL) ──
  matchOk: "✅ Amount matches",
  matchMismatch: "⚠️ Doesn't match",
  matchUnclear: "⚠️ Image unclear, check manually",
  matchDuplicate: "🚫 This photo was already used",
  matchPending: "⏳ Checking…",

  // ── Evidence upload slot (EvidenceSlot) ──
  evidenceUploadFailed: "Upload failed",
  evidenceNoImage: "No photo",
  evidenceLabelPrefix: "{label} evidence",
  evidenceMustMatch: "Must match {amount}",
  evidenceNotAttached: "Not attached yet",
  evidenceSending: "Uploading…",
  evidenceChangeImage: "Change photo",
  evidenceAttachImage: "Attach photo",
  evidenceLabelQr: "QR deposit summary",
  evidenceLabelGrab: "Grab summary",
  evidenceLabelLineman: "Lineman summary",

  // ── POS report photo slot (PosReportSlot) ──
  posCheckTitle: "Check against the POS iPad report",
  posCheckBody: "Open today's “Report” page on the POS and attach a photo — the system reads the amount and date in the photo for you",
  posImageAlt: "POS report",
  posAttachFailed: "Attaching photo failed",
  posReadingImage: "Reading photo…",
  posReattachButton: "Attach new photo",
  posAttachButton: "📷 Attach POS report photo",
  posStaleTitle: "Amount changed after attaching",
  posStaleBody: "The check was done against {before}, but the total entered is now {after} — attach a new photo to check again",
  posMatchOkTitle: "Data matches ✓",
  posMatchOkBody: "Matches the POS report on both total and cash",
  posMatchOkImageAmount: " · Amount in photo {amount}",
  posMatchOkBillCount: " · {n} bills",
  posUnclearTitle: "Photo unclear",
  posMismatchTitle: "Doesn't match the POS report",
  posRecheckDefault: "Double-check the numbers you entered",

  // ── Per-incident amount questions (AMOUNT_LABEL) ──
  amountLabelOverNoChange: "How much did the customer overpay (no change given)?",
  amountLabelOverCashChange: "How much cash did you give back to the customer?",
  amountLabelUnderCashTopup: "How much extra cash did the customer pay?",
  amountLabelMenuChangeRefund: "How much cash did you give back to the customer?",
  amountLabelVoidFullRefund: "How much cash did you refund (equal to the amount transferred)?",

  // ── Payment incident kinds (INCIDENT_KINDS) ──
  incidentOverNoChangeLabel: "Overpaid transfer · no change given",
  incidentOverNoChangeHint: "The extra amount counts as store revenue",
  incidentOverCashChangeLabel: "Overpaid transfer · refunded in cash",
  incidentOverCashChangeHint: "Take cash from the drawer to refund the customer",
  incidentUnderCashTopupLabel: "Underpaid transfer · topped up with cash",
  incidentUnderCashTopupHint: "Transfer didn't cover it, so the customer paid the difference in cash",
  incidentVoidFullRefundLabel: "Customer cancelled the whole bill · refunded in full",
  incidentVoidFullRefundHint: "Customer transferred then didn't want it — void the bill on the POS and refund the full amount in cash. Enter only the amount transferred",
  incidentMenuChangeRefundLabel: "Voided bill / menu change · refunded from drawer",
  incidentMenuChangeRefundHint:
    "Transferred, then the old bill was voided and a cheaper one keyed in — refund the difference in cash · for a full cancellation, enter the new bill amount as 0",

  // ── Page: branch/date ──
  dateLabel: "Date",

  // ── In-store ──
  inStoreTitle: "In-store",
  totalBadge: "Total {amount}",
  cashLabel: "Cash",
  edcLabel: "Card (EDC)",
  posHintPrefix: "Enter every field exactly as summarized on the ",
  posHintSuffix: ".",
  posHintSub: "If there's an underpaid/overpaid transfer or cash refund case, the system calculates it automatically — add a case below",

  // ── Payment mismatch cases ──
  incidentSectionTitle: "Payment doesn't match the bill",
  incidentSectionSubtitle: "Tap when there's an overpaid/underpaid transfer case",
  incidentBaseHint: "Every underpaid/overpaid case is calculated from the QR amount — if QR is blank, the numbers will be off",
  incidentAddButton: "+ Add case",
  incidentNeedQrPrefix: "Enter the ",
  incidentNeedQrSuffix: " amount above from the POS first before you can add a case",
  incidentNeedQrSub: "Because every case is calculated from the QR amount as its base — if the base is still blank, the actual amount received will be off",
  incidentRemoveButton: "Remove",
  incidentAmountPlaceholder: "e.g. 129",
  incidentAdjustQr: "System will adjust: QR amount {amount}",
  incidentAdjustCash: " · cash in drawer {amount}",
  incidentAdjustOverBill: " · over bill {amount} (counts as store revenue)",

  actualAmountTitle: "Actual amount received — must match the banking app",
  actualQrLabel: "QR",
  actualQrPosNote: "(POS {amount})",
  actualCashLabel: "Cash in drawer",
  overBillTotal: "Total over bill {amount} (counts as store revenue)",
  actualAmountFooter: "Compare this number against the banking app — if it doesn't match, there's still an unrecorded case",

  saveIncidentsButton: "Save cases (do this before attaching evidence)",
  incidentsSavedButton: "✓ Cases saved",
  incidentsDirtyWarning: "Cases not saved yet — attaching evidence now may not match",
  saveIncidentsFailed: "Failed to save cases",
  tryAgain: "Please try again",
  incidentsDirtyEvidenceLock: "Tap “Save cases” above first, then the QR evidence slot will open up",
  incidentsDirtyEvidenceLockSub: "Because the amount used to check against the slip must already include the case adjustments",

  // ── Delivery ──
  deliveryTitle: "Delivery",

  // ── Daily total / POS check ──
  statTotalToday: "Total for the day",

  // ── missing evidence ──
  missingEvidenceQr: "QR summary",
  missingEvidencePos: "POS sales report",
  missingEvidenceAlert: "Evidence not attached yet: {list}",

  // ── Save sales ──
  loadFailed: "Failed to load data",
  saveFailedGeneric: "Save failed",
  savedSuccessTitle: "Sales saved successfully",
  savedSuccessBody: "{branch} branch · {date} · total for the day {amount}",
  saveStillFailedTitle: "Still not saved",
  saveAgainPrompt: "Try saving again",
  saveSalesButton: "Save sales",

  // ── Popup after checking the POS report photo ──
  posMatchOkDialogTitle: "Checked, data matches ✓",
  posMatchOkDialogBody: "One step left — today's sales haven't been saved yet",
  posMatchOkDialogAction: "Save sales now",
  posMatchOkDialogSecondary: "Later",
  posMismatchDialogTitle: "Amount still doesn't match the POS report",
  posMismatchDialogBody: "Double-check the numbers you entered, then attach a new photo",
  posMismatchDialogAction: "Go back and fix the numbers",

  dialogOkClose: "Done",
  dialogWarnClose: "Close",

  // ── /api/sales, /api/sales/pos-report, /api/sales/incidents, /api/sales-evidence ──
  errInvalidDate: "Invalid date (YYYY-MM-DD)",
  errInvalidRow: "Invalid row",
  errUnsupportedImageType: "Only JPEG/PNG/WebP are supported",
  errNoImageAttached: "No photo attached",
  errInvalidType: "Invalid type ({types})",
};
