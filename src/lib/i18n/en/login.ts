import type { th } from "../th/login";

export const en: typeof th = {
  appTitle: "Stock Management System",
  heading: "Sign in",
  pinLabel: "Access code",
  submit: "Sign in",
  submitting: "Signing in…",
  footerLine1: "Use your personal code · First time in, use the setup code you were given, then set your own",
  footerLine2: "Forgot your code — ask an admin to issue a new setup code",
  errGeneric: "Sign-in failed",
  errNetwork: "Couldn't connect — please try again",
  errEmptyPin: "Enter your code",
  errSetupExpired: "This setup code has expired — ask an admin to issue a new one",
  errWrongWithCountdown:
    "Incorrect code ({left} tries left before a temporary lock) — if you just set a new PIN, use that PIN, not the old setup code (it only works once)",
  errWrong: "Incorrect code",
  errTooManyFails: "Too many incorrect attempts — wait {minutes} minutes and try again",
  errServerError: "Sign-in failed — please try again",
};
