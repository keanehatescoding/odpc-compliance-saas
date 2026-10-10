import { formatDate } from "./dates";
import type { LawfulBasis } from "./dpa";
import type { ActivityInput } from "./ropa";
import { REQUEST_KINDS } from "./subject-request";

/**
 * A privacy notice for the people whose data an organisation processes, built
 * from its RoPA. Section 29 of the Act says what they must be told before data
 * is collected: their rights, why the data is collected, who receives it, the
 * controller's contacts, how it is protected, whether giving it is voluntary
 * or mandatory, and transfers outside Kenya.
 */

export interface NoticeOrg {
  name: string;
  privacyContact: string | null;
  privacyEmail: string | null;
  privacyPhone: string | null;
  address: string | null;
}

export interface NoticeRegistration {
  role: string;
  certificateNumber: string | null;
  expiresOn: string | null;
}

export type NoticeBlock =
  | { kind: "p"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "facts"; items: { label: string; value: string }[] }
  | { kind: "h3"; text: string };

export interface NoticeSection {
  heading: string;
  blocks: NoticeBlock[];
}

export interface PrivacyNotice {
  title: string;
  audience: string | null;
  updatedOn: string;
  sections: NoticeSection[];
  /** What the organisation should fill in before publishing. Not part of the notice. */
  missing: string[];
}

/** How each lawful basis reads to the person, and whether giving the data is optional. */
const BASIS_TEXT: Record<LawfulBasis, { why: string; required: string | null }> = {
  consent: {
    why: "Your consent.",
    required: "No. It's your choice, and you can withdraw your consent at any time. Withdrawing doesn't affect what we did before.",
  },
  contract: {
    why: "We need it to enter into or carry out a contract with you.",
    required: "Yes, to enter into or carry out the contract. Without it we can't.",
  },
  legal_obligation: {
    why: "The law requires us to.",
    required: "Yes. The law requires it.",
  },
  vital_interests: { why: "To protect your life or health, or someone else's.", required: null },
  public_interest: { why: "To carry out a task in the public interest.", required: null },
  official_authority: { why: "To exercise official authority given to us by law.", required: null },
  legitimate_interests: {
    why: "Our legitimate interests, which we weigh against your rights and interests. You can object.",
    required: null,
  },
  research: { why: "Historical, statistical, journalistic, literary, artistic or scientific research.", required: null },
};

export const ODPC_WEBSITE = "https://www.odpc.go.ke";

const sameAudience = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Distinct values, ignoring case and surrounding space, in first-seen order and spelling. */
function unique(values: string[]): string[] {
  const seen = new Map<string, string>();
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (key && !seen.has(key)) seen.set(key, v.trim());
  }
  return [...seen.values()];
}

/** The categories of data subject across the RoPA, one per spelling-insensitive name, sorted. */
export function noticeAudiences(activities: Pick<ActivityInput, "dataSubjects">[]): string[] {
  return unique(activities.flatMap((a) => a.dataSubjects)).sort((a, b) => a.localeCompare(b));
}

/** The activities a notice for `audience` covers: all of them when it's null. */
export function activitiesFor<T extends Pick<ActivityInput, "dataSubjects">>(activities: T[], audience: string | null): T[] {
  if (audience === null) return activities;
  return activities.filter((a) => a.dataSubjects.some((s) => sameAudience(s, audience)));
}

/** Joins list items as one sentence: "a;", "b; and", "c." */
function asSentence(items: string[]): string[] {
  return items.map((item, i) => item + (i === items.length - 1 ? "." : i === items.length - 2 ? "; and" : ";"));
}

export function buildPrivacyNotice(input: {
  org: NoticeOrg;
  activities: ActivityInput[];
  registrations: NoticeRegistration[];
  audience: string | null;
  today: string;
}): PrivacyNotice {
  const { org, registrations, audience, today } = input;
  const activities = activitiesFor(input.activities, audience);
  const missing: string[] = [];
  const sections: NoticeSection[] = [];

  // Who we are
  const controller = registrations.find(
    (r) => r.role === "controller" && r.certificateNumber && r.expiresOn && r.expiresOn >= today,
  );
  const who: NoticeBlock[] = [
    {
      kind: "p",
      text: `${org.name} decides why and how your personal data is used, which makes us its data controller under the Data Protection Act, 2019.${
        controller ? ` We are registered with the Office of the Data Protection Commissioner (certificate ${controller.certificateNumber}).` : ""
      }`,
    },
  ];
  const contacts = [
    org.privacyContact && { label: "Contact", value: org.privacyContact },
    org.privacyEmail && { label: "Email", value: org.privacyEmail },
    org.privacyPhone && { label: "Phone", value: org.privacyPhone },
    org.address && { label: "Address", value: org.address },
  ].filter((c): c is { label: string; value: string } => Boolean(c));
  if (contacts.length > 0) {
    who.push({ kind: "p", text: "For anything about your personal data, contact us:" }, { kind: "facts", items: contacts });
  }
  if (!org.privacyEmail && !org.privacyPhone) missing.push("An email address or phone number people can contact about their data.");
  if (!org.address) missing.push("Your physical or postal address.");
  sections.push({ heading: "Who we are", blocks: who });

  // What we collect and why
  const what: NoticeBlock[] = [];
  for (const a of activities) {
    const basis = BASIS_TEXT[a.lawfulBasis];
    const facts: { label: string; value: string }[] = [
      { label: "Why", value: a.purpose },
      { label: "What", value: a.dataCategories.join(", ") },
    ];
    if (a.sensitiveCategories.length > 0) facts.push({ label: "Sensitive data", value: a.sensitiveCategories.join(", ") });
    facts.push({ label: "Legal basis", value: basis.why });
    if (basis.required) facts.push({ label: "Do you have to give it?", value: basis.required });
    if (a.recipients) facts.push({ label: "Shared with", value: a.recipients });
    if (a.crossBorder) {
      facts.push({
        label: "Sent outside Kenya",
        value: a.transferSafeguards ? `To ${a.transferCountries}. ${a.transferSafeguards}` : `To ${a.transferCountries}.`,
      });
    }
    facts.push({ label: "Kept for", value: a.retentionPeriod });
    what.push({ kind: "h3", text: a.name }, { kind: "facts", items: facts });
  }
  sections.push({ heading: "What we collect and why", blocks: what });
  if (activities.some((a) => a.crossBorder && !a.transferSafeguards)) {
    missing.push("How data sent outside Kenya is protected, for each activity that sends it (Transfer safeguards in the RoPA).");
  }

  if (activities.some((a) => a.involvesChildren)) {
    sections.push({
      heading: "Children",
      blocks: [
        {
          kind: "p",
          text: "We process a child's personal data only with the consent of their parent or guardian, and in a way that protects and advances the child's rights and best interests.",
        },
      ],
    });
  }

  // How we protect it
  const measures = unique(activities.map((a) => a.securityMeasures).filter(Boolean));
  sections.push({
    heading: "How we protect it",
    blocks:
      measures.length > 0
        ? [{ kind: "p", text: "To keep your personal data safe we use these measures:" }, { kind: "list", items: measures }]
        : [{ kind: "p", text: "We use technical and organisational measures to keep your personal data safe from loss, misuse and unauthorised access." }],
  });
  if (activities.length > 0 && measures.length === 0) {
    missing.push("How you protect the data (Security measures in the RoPA). Without it the notice says only that you use suitable measures.");
  }
  sections.push({
    heading: "If something goes wrong",
    blocks: [
      {
        kind: "p",
        text: "If your personal data is accessed or lost in a way that puts you at real risk of harm, we will tell you and the Data Commissioner, and say what we are doing about it.",
      },
    ],
  });

  // Your rights
  const consent = activities.some((a) => a.lawfulBasis === "consent");
  const days = (kind: keyof typeof REQUEST_KINDS) => `within ${REQUEST_KINDS[kind].days} days`;
  const rights = [
    "be told how your personal data is used (this notice)",
    `see the personal data we hold about you (we'll respond ${days("access")})`,
    `have false or misleading data corrected (${days("rectification")})`,
    `have false, misleading or unneeded data deleted (${days("erasure")})`,
    `object to our processing, or ask us to restrict it (${days("objection")})`,
    `receive your data in a structured, machine-readable form, or have it sent to another organisation (${days("portability")})`,
    `stop us sharing it with others for their marketing (${days("marketing")})`,
    "not be subject to a decision based only on automated processing that significantly affects you",
  ];
  if (consent) rights.push("withdraw your consent at any time");
  const reach = [org.privacyEmail, org.privacyPhone].filter(Boolean).join(" or ");
  sections.push({
    heading: "Your rights",
    blocks: [
      { kind: "p", text: "Under the Data Protection Act, 2019 you have the right to:" },
      { kind: "list", items: asSentence(rights) },
      {
        kind: "p",
        text: `${reach ? `To use any of these rights, contact us at ${reach}.` : "To use any of these rights, contact us."} We may ask you to confirm who you are first. If we can't do what you ask, we'll tell you why in writing.`,
      },
    ],
  });

  sections.push({
    heading: "Complaints",
    blocks: [
      {
        kind: "p",
        text: `If you're unhappy with how we handle your personal data, please tell us. You can also complain to the Office of the Data Protection Commissioner (${ODPC_WEBSITE.replace("https://", "")}).`,
      },
    ],
  });

  sections.push({
    heading: "Changes to this notice",
    blocks: [{ kind: "p", text: `We'll update this notice when how we use personal data changes. It was last updated on ${formatDate(today)}.` }],
  });

  return {
    title: `${org.name} privacy notice`,
    audience,
    updatedOn: today,
    sections,
    missing,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Multi-line values (such as an address) keep their line breaks. */
function lines(s: string): string {
  return escapeHtml(s).replace(/\r?\n/g, "<br>");
}

/** The notice as a standalone HTML page, to put on a website or open in a word processor. */
export function privacyNoticeHtml(notice: PrivacyNotice): string {
  const body = notice.sections
    .map((s) => {
      const blocks = s.blocks
        .map((b) => {
          switch (b.kind) {
            case "p":
              return `<p>${lines(b.text)}</p>`;
            case "h3":
              return `<h3>${escapeHtml(b.text)}</h3>`;
            case "list":
              return `<ul>${b.items.map((i) => `<li>${lines(i)}</li>`).join("")}</ul>`;
            case "facts":
              return `<dl>${b.items.map((i) => `<dt>${escapeHtml(i.label)}</dt><dd>${lines(i.value)}</dd>`).join("")}</dl>`;
          }
        })
        .join("\n");
      return `<h2>${escapeHtml(s.heading)}</h2>\n${blocks}`;
    })
    .join("\n\n");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(notice.title)}</title>
<style>
body { font-family: system-ui, sans-serif; line-height: 1.5; max-width: 42rem; margin: 2rem auto; padding: 0 1rem; color: #1c1917; }
h2 { margin-top: 2rem; }
dl { display: grid; grid-template-columns: 11rem 1fr; gap: 0.25rem 1rem; }
dt { color: #57534e; }
dd { margin: 0; }
@media (max-width: 32rem) { dl { grid-template-columns: 1fr; } dd { margin-bottom: 0.5rem; } }
</style>
</head>
<body>
<h1>${escapeHtml(notice.title)}</h1>
${notice.audience ? `<p>For ${escapeHtml(notice.audience)}</p>\n` : ""}
${body}
</body>
</html>
`;
}
