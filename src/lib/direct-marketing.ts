// Using personal data to market to people. Section 37(1) of the Data
// Protection Act, 2019 lets a person use personal data for commercial purposes
// only with the data subject's express consent, or where a written law
// authorises it and the data subject was told of that use when the data was
// collected. Section 37(2) asks for the data to be anonymised where possible.
//
// Part III of the Data Protection (General) Regulations, 2021 fills this in.
// Regulation 14 counts direct marketing (a catalogue addressed to someone, an
// advertisement shown to someone logged in, or an electronic message about a
// sale) as commercial use, and marketing that doesn't identify or target
// particular people as not direct. Regulation 15(1) allows personal data other
// than sensitive personal data to be used for it where it was collected from
// the person, they were told and consented, a simplified opt-out is provided
// and they haven't opted out. Regulation 15(2) says no message goes out without
// saying where to send a free request to stop, and 15(3) bars disguising the
// sender, giving no address to opt out to, and automated calling systems
// without a person. Regulations 16 and 17 say what the opt-out looks like and
// that each message says how to use it; 16(2) that someone who opted out isn't
// marketed to. Regulation 18 lets people stop their data being shared with
// others for marketing, free and within seven days.
// Plain-language summary; check against the Act and current ODPC guidance
// before relying on it.

export const DIRECT_MARKETING_PROVISION = "Data Protection Act, 2019, s.37; Data Protection (General) Regulations, 2021, regs. 14–18";

/** What s.37(1) accepts as allowing personal data to be used for marketing. */
export const MARKETING_GROUNDS = {
  consent: "The person's express consent",
  law: "Authorised by a written law, and people were told when their data was collected",
} as const;

export type MarketingGround = keyof typeof MARKETING_GROUNDS;
export const MARKETING_GROUND_KEYS = Object.keys(MARKETING_GROUNDS) as MarketingGround[];

/** What the record should say about the ground it gives. */
export const MARKETING_GROUND_DETAIL: Record<MarketingGround, string> = {
  consent:
    "Ask for it separately from your other terms, with nothing ticked in advance, and record it as a consent record. Regulation 15(1) also expects the data to have come from the person and the marketing to be one of the purposes they were told about.",
  law: "Name the law when you describe how you market. People must have been told about the marketing when the data was collected from them (s.37(1)(b)).",
};

export interface DirectMarketingLike {
  name: string;
  directMarketing: boolean;
  /** Null until someone says which ground applies. A string as it comes back from the database. */
  marketingGround: MarketingGround | string | null;
  /** How people are marketed to: the channels and what is sent. */
  marketingChannels: string;
  /** How people opt out, free of charge, as each message says. */
  marketingOptOut: string;
  /** Where opt-outs are kept and how they're checked before anything is sent. */
  marketingOptOutRecords: string;
  /** Sensitive personal data the activity involves, which reg. 15(1) keeps out of marketing. */
  sensitiveCategories: string[];
}

export type DirectMarketingIssue = "no_ground" | "no_channels" | "no_opt_out" | "no_opt_out_records" | "sensitive";

/** What the record still needs. None when the activity isn't used for direct marketing. */
export function directMarketingIssues(a: DirectMarketingLike): DirectMarketingIssue[] {
  if (!a.directMarketing) return [];
  const issues: DirectMarketingIssue[] = [];
  if (!a.marketingGround) issues.push("no_ground");
  if (!a.marketingChannels.trim()) issues.push("no_channels");
  if (!a.marketingOptOut.trim()) issues.push("no_opt_out");
  if (!a.marketingOptOutRecords.trim()) issues.push("no_opt_out_records");
  if (a.sensitiveCategories.length > 0) issues.push("sensitive");
  return issues;
}

/** What to do about an issue, as the activity's page lists it. */
export function directMarketingGap(a: Pick<DirectMarketingLike, "sensitiveCategories">, issue: DirectMarketingIssue): string {
  if (issue === "sensitive") {
    return `Keep sensitive personal data out of marketing (reg. 15(1)). This activity involves ${a.sensitiveCategories.join(", ").toLowerCase()}. If that isn't used to choose who gets messages or what they say, record the marketing as an activity of its own without it.`;
  }
  return DIRECT_MARKETING_GAP[issue];
}

const DIRECT_MARKETING_GAP: Record<Exclude<DirectMarketingIssue, "sensitive">, string> = {
  no_ground:
    "Say what allows you to use the data for marketing (s.37(1)): the person's express consent, or a written law that authorises it, with people told when the data was collected. Without one, stop the marketing.",
  no_channels: "Say how you market to people: SMS, WhatsApp, email, phone calls, post or targeted adverts, and what you send.",
  no_opt_out:
    "Say how people opt out. Every message has to say how, and opting out must be free (or cost no more than a nominal amount), quick and accessible to people with a disability (regs. 15(2), 16 and 17).",
  no_opt_out_records:
    "Say where opt-outs are kept and how the list is checked before anything is sent, so nobody who opted out is marketed to again (regs. 15(1)(e) and 16(2)).",
};

/** The issues as one next step on the dashboard. */
export function directMarketingTodo(a: Pick<DirectMarketingLike, "name">, issues: DirectMarketingIssue[]): string {
  const say = issues.filter((i) => i !== "sensitive").map((i) => TODO_PART[i]);
  const parts = [...(say.length > 0 ? [`say ${joinAnd(say)}`] : []), ...(issues.includes("sensitive") ? ["keep sensitive data out of it"] : [])];
  const text = joinAnd(parts);
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} for the marketing in ${a.name}`;
}

const TODO_PART: Record<Exclude<DirectMarketingIssue, "sensitive">, string> = {
  no_ground: "what allows it",
  no_channels: "how you market",
  no_opt_out: "how people opt out",
  no_opt_out_records: "where opt-outs are kept",
};

/** The same issues as the compliance report states them. */
export function directMarketingFinding(a: Pick<DirectMarketingLike, "name">, issues: DirectMarketingIssue[]): string {
  const missing = issues.filter((i) => i !== "sensitive").map((i) => FINDING_PART[i]);
  const sentences = [];
  if (missing.length > 0) sentences.push(`${a.name} is used for direct marketing, and the record doesn't say ${joinAnd(missing)}.`);
  if (issues.includes("sensitive")) {
    sentences.push(`${a.name} is used for direct marketing and involves sensitive personal data, which reg. 15(1) doesn't allow to be used for it.`);
  }
  return sentences.join(" ");
}

const FINDING_PART: Record<Exclude<DirectMarketingIssue, "sensitive">, string> = {
  no_ground: "what s.37(1) ground allows it",
  no_channels: "how people are marketed to",
  no_opt_out: "how people opt out",
  no_opt_out_records: "where opt-outs are kept or how they're honoured",
};

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The marketing activities that have something missing, with what. */
export function activitiesWithDirectMarketingIssues<A extends DirectMarketingLike>(activities: A[]): { activity: A; issues: DirectMarketingIssue[] }[] {
  return activities.map((activity) => ({ activity, issues: directMarketingIssues(activity) })).filter((x) => x.issues.length > 0);
}

/** Text as a sentence that the next one can follow: trimmed, with a full stop if it has no closing punctuation. */
const asSentence = (text: string) => {
  const t = text.trim();
  return !t || /[.!?)"”]$/.test(t) ? t : `${t}.`;
};

/** What a person is told about an activity's marketing in the privacy notice (reg. 15(1)(b)), or null when there is none. */
export function directMarketingNotice(a: Pick<DirectMarketingLike, "directMarketing" | "marketingChannels" | "marketingOptOut">): string | null {
  if (!a.directMarketing) return null;
  const channels = asSentence(a.marketingChannels);
  const optOut = asSentence(a.marketingOptOut);
  return [
    channels ? `We use your details to send you marketing. ${channels}` : "We use your details to send you marketing.",
    "You can opt out at any time, free of charge, and we'll stop.",
    optOut,
  ]
    .filter(Boolean)
    .join(" ");
}

/** What s.37 and regs. 14–18 ask of direct marketing, as a checklist on the activity's page. */
export const DIRECT_MARKETING_CHECKLIST = [
  "People gave their express consent, or a written law authorises the marketing and they were told about it when their data was collected (s.37(1))",
  "The data was collected from the person, and marketing was one of the purposes they were told about (reg. 15(1)(a) and (b))",
  "No sensitive personal data is used to choose who is marketed to or what they're sent (reg. 15(1))",
  "Every message names the sender and says how to opt out, free of charge: a reply such as STOP to an SMS, an unsubscribe link in an email, or saying so on a call (regs. 15(2) and (3) and 17)",
  "Opting out is clear, quick, free or at most a nominal cost, and accessible to people with a disability, and people can opt out of all marketing at once (regs. 16(1) and 17(4))",
  "Anyone who has opted out is taken off every list before the next send (regs. 15(1)(e) and 16(2))",
  "No automated calling system calls people without a person on the line (reg. 15(3)(c))",
  "A request to stop sharing someone's data with others for their marketing is honoured within 7 days, free (reg. 18)",
  "The data is anonymised where marketing doesn't need to know who people are, such as for analysing campaigns (s.37(2))",
] as const;
