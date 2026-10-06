// One-off services sold alongside the subscription. Shared by server code and
// pages, so kept free of database imports.
import type { OrgSize } from "./dpa";

export interface Service {
  name: string;
  /** The name mid-sentence, e.g. "your expert DPIA review". */
  noun: string;
  /** What it is, in a sentence. */
  description: string;
  /** What the customer gets at the end. */
  deliverable: string;
  turnaround: string;
  /** In KSh, by the organisation size set in Settings. */
  prices: Record<OrgSize, number>;
}

export const SERVICES = {
  dpia_review: {
    name: "Expert DPIA review",
    noun: "expert DPIA review",
    description:
      "A data protection specialist reviews one of your impact assessments in Kinga against s.31 of the Act and the ODPC's DPIA guidance.",
    deliverable: "Written feedback on each section and risk, and the changes needed before you approve it or consult the ODPC.",
    turnaround: "10 working days",
    prices: { micro_small: 15_000, medium: 25_000, large: 40_000 },
  },
  compliance_audit: {
    name: "Compliance audit",
    noun: "compliance audit",
    description:
      "A review of your registration, records of processing, impact assessments, breach and request handling, policies and notices against the Act and its Regulations.",
    deliverable: "An audit report rating each area, with a prioritised action plan.",
    turnaround: "20 working days",
    prices: { micro_small: 25_000, medium: 45_000, large: 75_000 },
  },
} as const satisfies Record<string, Service>;

export type ServiceKey = keyof typeof SERVICES;
export const SERVICE_KEYS = Object.keys(SERVICES) as ServiceKey[];

export const SERVICE_ORDER_STATUSES = {
  awaiting_payment: "Awaiting payment",
  paid: "Paid, not started",
  in_progress: "In progress",
  delivered: "Delivered",
  cancelled: "Cancelled",
} as const;
export type ServiceOrderStatus = keyof typeof SERVICE_ORDER_STATUSES;
export const SERVICE_ORDER_STATUS_KEYS = Object.keys(SERVICE_ORDER_STATUSES) as ServiceOrderStatus[];

/** What the customer wants covered, e.g. which DPIA. */
export const SERVICE_NOTES_MAX = 2000;
