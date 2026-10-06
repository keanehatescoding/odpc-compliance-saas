import { z } from "zod";

/**
 * The Terms, Privacy Notice and Data Processing Agreement. Change the version
 * whenever the Terms or the DPA change in substance; each account records the
 * version it agreed to at signup.
 */
export const TERMS_VERSION = "2026-10-06";

/** The signup forms' required "I agree" checkbox. */
export const termsAgreed = z.literal("on", { error: "Agree to the terms to create an account." });

/** How long payment records outlive a deleted organisation: s.23 of the Tax Procedures Act, 2015. */
export const TAX_RECORD_YEARS = 5;

/**
 * Who processes personal data for Kinga. (KRA isn't one: it receives sales by law.) Listed in the Privacy Notice and the
 * DPA, so keep it in step with the deployment (README, "Caveats").
 */
export const SUBPROCESSORS = [
  {
    name: "Railway",
    what: "Hosts the app and its database.",
    where: "Outside Kenya",
  },
  {
    name: "Our email provider",
    what: "Delivers reminders, alerts, invitations, receipts and sign-in emails.",
    where: "Outside Kenya",
  },
  {
    name: "Paystack",
    what: "Takes payments by M-Pesa and card, and keeps the card for automatic renewal if you ask.",
    where: "Kenya and Nigeria",
  },
] as const;
