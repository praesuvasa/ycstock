import type { th } from "../th/setPin";

export const en: typeof th = {
  title: "Set your code",
  branchPrefix: "Branch ",
  introSuffix: "Set a 6-digit code you'll remember — you'll use it to sign in next time",
  newPinLabel: "New code (6 digits)",
  confirmLabel: "Confirm again",
  saving: "Saving…",
  save: "Save code",
  warnTitle: "Don't share this with anyone",
  warnBody: "Even an admin can't see this code — the system only stores an encrypted value",
  warnForgot: "If you forget it, ask an admin for a “new setup code”, then set a new one on this page",
  ruleHint: "Can't use all-repeating digits (e.g. 111111) or sequential digits (e.g. 123456) — too easy to guess",
  successAlert: "Code saved — use it to sign in next time",
  errRepeat: "All-repeating digits aren't allowed (e.g. 111111)",
  errSequential: "Sequential digits aren't allowed (e.g. 123456)",
  errNotSixDigits: "Code must be 6 digits",
  errMismatch: "The two codes don't match",
  errDuplicate: "That code can't be used — try a different one",
  errGeneric: "Couldn't save the code",
  errServerError: "Couldn't save the code — please try again",
};
