import type { th } from "../th/allowance";

export const en: typeof th = {
  pageTitle: "In-store staff discount",
  notEnabled: "This account doesn't have this benefit enabled",
  billImageAlt: "Receipt",

  summary: {
    remainingLabel: "Remaining this month",
    usedOfMonthly: "Used {used} of {monthly} · resets {nextMonth}",
    exhaustedNotice: "You've used up this month's allowance — you can still buy at the regular 30% discount",
    exhaustedNoRecord: " no need to log it",
    exhaustedReason: " since it doesn't count against your allowance",
  },

  form: {
    heading: "Log a bill you used your allowance on",
    dateLabel: "Purchase date",
    billTotalLabel: "Total before discount",
    discountLabel: "Discount used from allowance",
    paidSelfLabel: "You paid",
    remainingAfterLabel: "Remaining after saving",
    overQuotaWarning: "This discount exceeds your remaining allowance ({remaining}) — it will still save, but an admin will need to review it",
    imageLabel: "Receipt photo — attach one and the amounts fill in automatically",
    saveButton: "Log this use",
    billTotalTooLow: "The total before discount can't be less than the discount",
  },

  ocr: {
    reading: "Reading the amounts from your photo…",
    unclear: "Photo isn't clear enough — enter the amounts yourself and double-check before saving",
    noDiscountFound: "Couldn't find a discount line on this receipt — enter it yourself",
    done: "Filled in the amounts from your photo — check they're correct before saving",
    fallbackSuffix: " — you can still enter the amounts yourself",
  },

  save: {
    successAlert: "Saved ✓",
    needsReviewAlert: "Saved — but sent to an admin for review\n{note}",
    genericError: "Couldn't save",
  },

  list: {
    heading: "Used this month",
    empty: "No entries yet",
    billAndPaid: "Bill {bill} · you paid {paid}",
    pendingReview: " · pending admin review",
  },

  admin: {
    sectionTitle: "Team overview (admin)",
    totalUsed: "Total used",
    totalQuota: "Total quota",
    noOneEnabled: "No one has this benefit enabled yet",
    usedShort: "Used {amount}",
    remainingShort: "Remaining {amount}",
    needsReviewTitle: "Bills needing review ({count})",
  },

  errors: {
    invalidMonth: "Invalid month (YYYY-MM)",
    invalidDate: "Invalid date",
    discountMustBePositive: "Discount amount must be greater than 0",
    unsupportedMediaType: "Only JPEG/PNG/WebP are supported",
    noImageAttached: "No image attached",
    readBillFailed: "Couldn't read the bill",
  },
};
