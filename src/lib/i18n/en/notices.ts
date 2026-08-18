import type { th } from "../th/notices";

export const en: typeof th = {
  title: "Special Notices",
  adminOnly: "Admin only",
  allBranches: "All branches",
  branchBadgePrefix: "Branch ",
  addTitle: "Add notice",
  hint: 'Use this to flag anything outside the normal delivery schedule — like a supplier holiday or a branch-only closure. The message shows on the "Request items" page for the selected branch until you close it.',
  targetBranchLabel: "Post to branch",
  messageLabel: "Message",
  messagePlaceholder: "e.g. Delivery is running 1 day late this week — driver is on leave",
  addButton: "Add notice",
  emptyMessageError: "Enter a notice message",
  loadFailedFallback: "Couldn't load",
  createFailedFallback: "Couldn't create notice",
  deleteConfirm: "Close this notice?",
  deleteFailedFallback: "Couldn't close notice",
  closing: "Closing…",
  closeButton: "Close notice",
  emptyState: "No notices yet",
  errMessageRequired: "Message is required",
  errInvalidBranch: "Invalid branch",
};
