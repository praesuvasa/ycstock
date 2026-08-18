import type { th } from "../th/timeclockReport";

export const en: typeof th = {
  monthLabel: "Month",
  allBranches: "All branches",
  loadingText: "Loading…",

  summaryTitle: "Summary by staff",
  totalMonthLabel: "Total this month {value}",
  summaryEmptyState: "No one has clocked in this month yet",
  daysShiftsLabel: "{days} day(s) · {shifts} shift(s)",
  openShiftsSuffix: " · not clocked out yet {n}",

  dailyTitle: "Daily",
  productionUnit: "Production",
  notClockedOutYet: "Not clocked out",
  editedByBadge: "Edited by {name}",
  faceScanBadge: "Face scan {pct}%",
  distanceBadge: "{m} m from branch",
  editTimeButton: "Edit time",
  editNotePrefix: "Reason: {note}",
  emptyMonthState: "No data for this month",

  durationHoursOnly: "{h} hr",
  durationHoursMinutes: "{h} hr {m} min",

  dialogTitle: "Edit time · {name}",
  branchLabel: "Branch {branch}",
  clockInLabel: "Clock in",
  clockOutLabel: "Clock out",
  overnightNote: "Clock-out time is earlier than clock-in — the system will count this as overnight",
  reasonLabel: "Reason for editing (required)",
  reasonPlaceholder: "e.g. Forgot to clock out · Closed at 21:00",
  errReasonRequiredClient: "Please write a reason for the edit",
  errSaveFailed: "Save failed",
  cancelButton: "Cancel",
  savingButton: "Saving…",
  saveButton: "Save",
  editFooterNote: "This edit will record who made it and why · a “Edited” label will stay on this entry",

  // API /api/time-clock/report
  errInvalidMonth: "Invalid month (YYYY-MM)",
  errIdRequired: "id is required",
  errNoteRequired: "A reason for the edit is required (at least 3 characters)",
  errClockInInvalid: "Invalid clock-in time",
  errClockOutInvalid: "Invalid clock-out time",
  errClockOutAfterClockIn: "Clock-out time must be after clock-in time",
};
