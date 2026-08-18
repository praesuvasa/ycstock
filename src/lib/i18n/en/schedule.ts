import type { th } from "../th/schedule";

export const en: typeof th = {
  monthNav: {
    prev: "← Previous",
    next: "Next →",
  },
  dow: {
    sun: "Su", mon: "Mo", tue: "Tu", wed: "We", thu: "Th", fri: "Fr", sat: "Sa",
  },
  months: {
    jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", may: "May", jun: "Jun",
    jul: "Jul", aug: "Aug", sep: "Sep", oct: "Oct", nov: "Nov", dec: "Dec",
  },
  shift: {
    short: {
      fh: "Half", off: "Off", closed: "Closed", ph: "Hol",
      al: "Ann", sl: "Sick", pl: "Pers", lwp: "Unpaid",
    },
    work: {
      f: "Full day", m: "Morning", a: "Afternoon", fh: "Half day", off: "Off",
    },
    leave: {
      al: "Annual leave", pl: "Personal leave", sl: "Sick leave", ph: "Public holiday",
    },
  },
  picker: {
    noSchedule: "No shift set",
    nowPrefix: "Currently ",
    changeToShift: "Change shift to",
    saveAsLeave: "Log as leave",
    requestLeaveToday: "Request leave for today",
    sickSwapHint: "For sick leave or shift swaps, ask a senior staff member or admin to log it for you",
    close: "Close",
    promptEditReason: "Reason for the change (admin always sees this)",
    promptLeaveReason: "Reason for leave (admin always sees this)",
    reasonRequiredTitle: "Reason required",
    reasonRequiredBody: "At least 3 characters",
    errSaveFailed: "Save failed",
    saveFailedTitle: "Couldn't save",
    savedTitle: "Saved",
    savedDowngradedTitle: "Leave balance used up — logged as unpaid leave",
    remainingLeaveBody: "{n} days left this year",
  },
  requests: {
    pendingTitle: "Pending requests ({n})",
    requestedByPrefix: "Requested by ",
    approve: "Approve",
    reject: "Reject",
    actionFailedTitle: "Action failed",
    approvedTitle: "Approved — shift swapped",
    rejectedTitle: "Request rejected",
  },
  table: {
    dateColumnHeader: "Date →",
    emptyMonthTitle: "No schedule for this month yet",
    emptyMonthHint: "An admin or senior staff sets the schedule",
    hintEditable: "Tap any cell to edit — the system checks shift coverage and leave quotas before saving",
    hintReadonly: "Tap your own cell to request leave · every request notifies senior staff and admins automatically",
  },
  summary: {
    title: "Monthly summary",
    work: "Worked",
    off: "Off",
    leave: "Leave",
  },
  api: {
    editForbidden: "Only admins and senior staff can edit the schedule — everyone else should use the leave/swap request buttons",
    invalidDate: "Invalid date",
    missingPersonOrShift: "Both a person and a shift are required",
    reasonTooShort: "Please add a reason (at least 3 characters)",
  },
};
