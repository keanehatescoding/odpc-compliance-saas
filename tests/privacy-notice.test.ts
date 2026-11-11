import { describe, expect, it } from "vitest";
import { activitiesFor, buildPrivacyNotice, noticeAudiences, privacyNoticeHtml, type NoticeActivity, type NoticeOrg } from "@/lib/privacy-notice";

const activity = (over: Partial<NoticeActivity>): NoticeActivity => ({
  name: "Admissions",
  purpose: "Admit and enrol pupils",
  lawfulBasis: "contract",
  role: "controller",
  provision: "Yes. Without it we can't offer a place.",
  dataSubjects: ["Pupils", "Parents"],
  dataCategories: ["Name", "Date of birth"],
  sensitiveCategories: [],
  sensitiveDataGround: null,
  sensitiveDataBasis: "",
  healthDataCondition: null,
  sensitiveDataSafeguards: "",
  indirectCollection: false,
  indirectSources: "",
  indirectCollectionGrounds: [],
  indirectCollectionNotice: "",
  recipients: "",
  crossBorder: false,
  transferCountries: "",
  transferSafeguards: "",
  retentionPeriod: "Until the pupil leaves, plus 7 years",
  retentionLength: null,
  retentionUnit: null,
  retentionFrom: "",
  securityMeasures: "Locked cabinets",
  systems: "",
  owner: "",
  largeScale: false,
  systematicMonitoring: false,
  involvesChildren: false,
  automatedDecisions: false,
  automatedDecisionGround: null,
  automatedDecisionLogic: "",
  automatedDecisionReview: "",
  automatedDecisionChecks: "",
  directMarketing: false,
  marketingGround: null,
  marketingChannels: "",
  marketingOptOut: "",
  marketingOptOutRecords: "",
  ...over,
});

const org: NoticeOrg = {
  name: "Sunrise Academy",
  privacyContact: "The Bursar",
  privacyEmail: "privacy@sunrise.ac.ke",
  privacyPhone: null,
  address: "PO Box 1, Nairobi",
  dpoDesignated: null,
  dpoName: null,
  dpoEmail: null,
  dpoPhone: null,
  dpoAppointedOn: null,
  dpoNotifiedOn: null,
  dpoDetailsChangedOn: null,
};

const today = "2026-10-10";

function build(over: Partial<Parameters<typeof buildPrivacyNotice>[0]> = {}) {
  return buildPrivacyNotice({ org, activities: [activity({})], registrations: [], audience: null, today, ...over });
}

const text = (n: ReturnType<typeof build>) => JSON.stringify(n.sections);
const section = (n: ReturnType<typeof build>, heading: string) => n.sections.find((s) => s.heading === heading);

describe("noticeAudiences", () => {
  it("lists each category of data subject once, ignoring case, sorted", () => {
    const audiences = noticeAudiences([
      activity({ dataSubjects: ["Pupils", "Parents"] }),
      activity({ dataSubjects: ["parents ", "Staff"] }),
    ]);
    expect(audiences).toEqual(["Parents", "Pupils", "Staff"]);
  });
});

describe("processors", () => {
  it("asks for recipients when an activity has processors and names none", () => {
    const n = build({ activities: [activity({ name: "Fees", processors: ["Elimu Systems", "Jumbe SMS"] }), activity({ name: "Admissions" })] });
    expect(n.checks).toContain("Say who the data is shared with (Recipients). You've listed processors that handle it: Fees (Elimu Systems, Jumbe SMS).");
    expect(text(n)).not.toContain("Elimu Systems");
  });

  it("leaves the notice alone once recipients are described", () => {
    const n = build({ activities: [activity({ recipients: "Our school system provider", processors: ["Elimu Systems"] })] });
    expect(n.checks.join(" ")).not.toContain("Recipients");
  });
});

describe("consent records", () => {
  const marketing = (over: Partial<NoticeActivity> = {}) => activity({ name: "Newsletter", lawfulBasis: "consent", provision: "", ...over });

  it("asks for a consent record when a consent-based activity has none", () => {
    const n = build({ activities: [marketing({ consents: [] }), activity({ consents: [] })] });
    expect(n.checks).toContain("Record how you ask for consent and how people withdraw it (Consent records), for: Newsletter.");
  });

  it("asks how people withdraw when a record doesn't say", () => {
    const n = build({ activities: [marketing({ consents: [{ withdrawal: "Unsubscribe link" }, { withdrawal: "" }] })] });
    expect(n.checks).toContain("Say how people withdraw their consent (Consent records), for: Newsletter.");
  });

  it("says nothing once every record has a way out, or when the caller doesn't know the records", () => {
    for (const a of [marketing({ consents: [{ withdrawal: "Unsubscribe link" }] }), marketing()]) {
      expect(build({ activities: [a] }).checks.join(" ")).not.toContain("Consent records");
    }
  });

  it("leaves alone what the organisation processes for someone else", () => {
    const n = build({ activities: [activity({}), marketing({ role: "processor", consents: [] })] });
    expect(n.checks.join(" ")).not.toContain("Consent records");
  });
});

describe("legitimate interest assessments", () => {
  const cctv = (over: Partial<NoticeActivity> = {}) => activity({ name: "CCTV", lawfulBasis: "legitimate_interests", ...over });

  it("asks for an assessment when an activity on legitimate interests has none", () => {
    const n = build({ activities: [cctv({ assessments: [] }), activity({ assessments: [] })] });
    expect(n.checks).toContain("Assess whether your interest justifies the processing (Legitimate interests), for: CCTV.");
  });

  it("asks how people object when an assessment doesn't say", () => {
    const n = build({ activities: [cctv({ assessments: [{ outcome: "justified", objection: "Tell the office" }, { outcome: "justified", objection: "" }] })] });
    expect(n.checks).toContain("Say how people object (Legitimate interests), for: CCTV.");
  });

  it("flags an assessment that found against processing the notice still puts down to legitimate interests", () => {
    const n = build({ activities: [cctv({ assessments: [{ outcome: "overridden", objection: "Tell the office" }] })] });
    expect(n.checks).toContain(
      "Stop or change the processing your assessment found against, or record another lawful basis (Legitimate interests), for: CCTV.",
    );
  });

  it("says nothing once every assessment says how to object, or when the caller doesn't know the assessments", () => {
    for (const a of [cctv({ assessments: [{ outcome: "justified", objection: "Tell the office" }] }), cctv()]) {
      expect(build({ activities: [a] }).checks.join(" ")).not.toContain("Legitimate interests");
    }
  });

  it("leaves alone what the organisation processes for someone else", () => {
    const n = build({ activities: [activity({}), cctv({ role: "processor", assessments: [] })] });
    expect(n.checks.join(" ")).not.toContain("Legitimate interests");
  });
});

describe("transfers outside Kenya", () => {
  const mailing = (over: Partial<NoticeActivity> = {}) =>
    activity({ name: "Mailing list", crossBorder: true, transferCountries: "Ireland", transferSafeguards: "Contract clauses", ...over });
  const check = "Record what sending data outside Kenya relies on (Transfers outside Kenya), for: Mailing list.";

  it("asks what a transfer relies on when no record says", () => {
    expect(build({ activities: [mailing({ transfers: [] }), activity({ transfers: [] })] }).checks).toContain(check);
    expect(build({ activities: [mailing({ transfers: [{ basis: "pending" }] })] }).checks).toContain(check);
  });

  it("says nothing once a record gives a basis, or when the caller doesn't know the transfers", () => {
    for (const a of [mailing({ transfers: [{ basis: "pending" }, { basis: "safeguards" }] }), mailing()]) {
      expect(build({ activities: [a] }).checks.join(" ")).not.toContain("Transfers outside Kenya");
    }
  });
});

describe("automated decisions", () => {
  const scoring = activity({
    name: "Bursary applications",
    automatedDecisions: true,
    automatedDecisionGround: "contract",
    automatedDecisionLogic: "A score from your fee history decides whether you qualify",
    automatedDecisionReview: "Write to the Bursar to have it looked at again.",
  });
  const decisions = (n: ReturnType<typeof build>) =>
    section(n, "What we collect and why")!
      .blocks.flatMap((b) => (b.kind === "facts" ? b.items : []))
      .find((f) => f.label === "Automated decisions")?.value;

  it("tells people about the decisions, their right to a person, and how to ask", () => {
    const n = build({ activities: [scoring] });
    expect(decisions(n)).toBe(
      "A score from your fee history decides whether you qualify. We'll tell you in writing when a decision has been made this way, and you can ask us to reconsider it or to have a person take it again. Write to the Bursar to have it looked at again.",
    );
    expect(n.checks.join(" ")).not.toContain("Automated decisions");
  });

  it("asks for the logic and the way to a person when the record doesn't say", () => {
    const n = build({ activities: [{ ...scoring, automatedDecisionReview: "" }] });
    expect(decisions(n)).toContain("ask us to reconsider it");
    expect(n.checks).toContain(
      "Describe how automated decisions are made and how people ask for a person to look again (Automated decisions), for: Bursary applications.",
    );
  });

  it("reminds an organisation relying on consent to mention the decisions when it asks", () => {
    const n = build({ activities: [{ ...scoring, lawfulBasis: "consent" }] });
    expect(n.checks).toContain("Make sure the consent you ask for mentions the automated decisions, for: Bursary applications.");
  });

  it("says nothing for an activity without them", () => {
    const n = build();
    expect(decisions(n)).toBeUndefined();
    expect(n.checks.join(" ")).not.toContain("automated");
  });
});

describe("direct marketing", () => {
  const offers = activity({
    name: "Open day invitations",
    directMarketing: true,
    marketingGround: "consent",
    marketingChannels: "Invitations to open days by SMS",
    marketingOptOut: "Reply STOP to any message, free of charge.",
    marketingOptOutRecords: "Opt-out list in the SMS platform",
  });
  const marketing = (n: ReturnType<typeof build>) =>
    section(n, "What we collect and why")!
      .blocks.flatMap((b) => (b.kind === "facts" ? b.items : []))
      .find((f) => f.label === "Marketing")?.value;
  const rights = (n: ReturnType<typeof build>) => JSON.stringify(section(n, "Your rights"));

  it("tells people about the marketing, their right to opt out, and how", () => {
    const n = build({ activities: [offers] });
    expect(marketing(n)).toBe(
      "We use your details to send you marketing. Invitations to open days by SMS. You can opt out at any time, free of charge, and we'll stop. Reply STOP to any message, free of charge.",
    );
    expect(rights(n)).toContain("opt out of our marketing at any time, free of charge");
    expect(n.checks.join(" ")).not.toContain("Direct marketing");
  });

  it("counts marketing on consent as relying on consent, whatever the activity's lawful basis", () => {
    const n = build({ activities: [{ ...offers, consents: [] }] });
    expect(rights(n)).toContain("withdraw your consent at any time.");
    expect(n.checks).toContain("Record how you ask for consent and how people withdraw it (Consent records), for: Open day invitations.");
    expect(rights(build({ activities: [{ ...offers, marketingGround: "law" }] }))).not.toContain("withdraw your consent");
  });

  it("asks how people opt out, and for sensitive data to be kept out", () => {
    const n = build({ activities: [{ ...offers, marketingOptOut: " ", sensitiveCategories: ["Health data"] }] });
    expect(n.checks).toContain("Say how people opt out of marketing, free of charge (Direct marketing), for: Open day invitations.");
    expect(n.checks).toContain("Make sure no sensitive personal data is used for marketing (Direct marketing), for: Open day invitations.");
  });

  it("says nothing for an activity not used for marketing", () => {
    const n = build();
    expect(marketing(n)).toBeUndefined();
    expect(rights(n)).not.toContain("opt out of our marketing");
    expect(n.checks.join(" ")).not.toContain("marketing");
  });
});

describe("data collected from others", () => {
  const admissions = activity({
    indirectCollection: true,
    indirectSources: "Parents give their children's details on the admission form",
    indirectCollectionGrounds: ["no_prejudice"],
    indirectCollectionNotice: "The admission form says so",
  });
  const source = (n: ReturnType<typeof build>) =>
    section(n, "What we collect and why")!
      .blocks.flatMap((b) => (b.kind === "facts" ? b.items : []))
      .find((f) => f.label === "Where it comes from")?.value;

  it("tells people where data that isn't from them comes from", () => {
    const n = build({ activities: [admissions] });
    expect(source(n)).toBe("Some of it comes from others, not from you. Parents give their children's details on the admission form.");
    expect(n.checks.join(" ")).not.toContain("Where the data comes from");
  });

  it("asks where it comes from when the record doesn't say", () => {
    const n = build({ activities: [{ ...admissions, indirectSources: "" }] });
    expect(source(n)).toBe("Some of it comes from others, not from you.");
    expect(n.checks).toContain(
      "Say where the data that doesn't come from the person comes from (Where the data comes from), for: Admissions.",
    );
  });

  it("asks for the data used for marketing to have come from the person (reg. 15(1)(a))", () => {
    const n = build({ activities: [{ ...admissions, directMarketing: true, marketingGround: "consent", marketingOptOut: "Reply STOP" }] });
    expect(n.checks).toContain(
      "Make sure the data used for marketing was collected from the person, not from others (Direct marketing), for: Admissions.",
    );
  });

  it("says nothing when all the data comes from the person", () => {
    expect(source(build())).toBeUndefined();
  });
});

describe("activitiesFor", () => {
  const all = [activity({ name: "A", dataSubjects: ["Parents"] }), activity({ name: "B", dataSubjects: ["Staff"] })];

  it("keeps every activity for everyone", () => {
    expect(activitiesFor(all, null)).toHaveLength(2);
  });

  it("keeps the activities about one audience, ignoring case", () => {
    expect(activitiesFor(all, "staff").map((a) => a.name)).toEqual(["B"]);
  });
});

describe("buildPrivacyNotice", () => {
  it("publishes the data protection officer's contact details (s.24(6))", () => {
    const n = build({ org: { ...org, dpoDesignated: true, dpoName: "Achieng Otieno", dpoEmail: "dpo@sunrise.ac.ke" } });
    expect(section(n, "Who we are")?.blocks).toContainEqual({
      kind: "facts",
      items: [
        { label: "Name", value: "Achieng Otieno" },
        { label: "Email", value: "dpo@sunrise.ac.ke" },
      ],
    });
    expect(n.checks).toEqual([]);
  });

  it("asks for the officer's contact details when there is an officer but none to publish", () => {
    const n = build({ org: { ...org, dpoDesignated: true, dpoName: "Achieng Otieno" } });
    expect(text(n)).not.toContain("Achieng Otieno");
    expect(n.checks).toEqual(["Add an email address or phone number for your data protection officer, so the notice can publish it (Settings)."]);
  });

  it("leaves out details kept for an officer the organisation says it doesn't have", () => {
    const n = build({ org: { ...org, dpoDesignated: false, dpoName: "Former DPO", dpoEmail: "old@sunrise.ac.ke" } });
    expect(text(n)).not.toContain("old@sunrise.ac.ke");
    expect(n.checks).toEqual([]);
  });

  it("covers only the chosen audience's activities", () => {
    const n = build({
      activities: [activity({ name: "Admissions", dataSubjects: ["Parents"] }), activity({ name: "Payroll", dataSubjects: ["Staff"] })],
      audience: "Staff",
    });
    expect(text(n)).toContain("Payroll");
    expect(text(n)).not.toContain("Admissions");
    expect(n.audience).toBe("Staff");
  });

  it("says giving the data is a choice where the basis is consent", () => {
    const n = build({ activities: [activity({ lawfulBasis: "consent", provision: "" })] });
    expect(text(n)).toContain("It's your choice");
    expect(n.checks).toEqual([]);
  });

  it("uses the organisation's own answer on whether the data is required", () => {
    const n = build({ activities: [activity({ lawfulBasis: "consent", provision: "Only the phone number is optional." })] });
    expect(text(n)).toContain("Only the phone number is optional.");
    expect(text(n)).not.toContain("It's your choice");
  });

  it("doesn't assume the data is required from a contract or a legal obligation", () => {
    const n = build({
      activities: [
        activity({ name: "Payroll", lawfulBasis: "contract", provision: "" }),
        activity({ name: "KYC", lawfulBasis: "legal_obligation", provision: "" }),
        activity({ name: "CCTV", lawfulBasis: "legitimate_interests", provision: "Cameras cover the entrances." }),
      ],
    });
    expect(text(n)).not.toContain("Do you have to give it?\",\"value\":\"Yes");
    expect(text(n)).toContain("Cameras cover the entrances.");
    expect(n.checks).toEqual(["Say whether people have to give the data, and what happens if they don't, for: Payroll, KYC."]);
  });

  it("leaves out what the organisation processes for someone else, and says so", () => {
    const n = build({ activities: [activity({}), activity({ name: "Client payroll", role: "processor" })] });
    expect(text(n)).not.toContain("Client payroll");
    expect(n.covered).toBe(1);
    expect(n.checks).toHaveLength(1);
    expect(n.checks[0]).toContain("Client payroll");
  });

  it("leaves out an activity whose role nobody has confirmed, and asks for it", () => {
    const n = build({ activities: [activity({}), activity({ name: "Old mailing list", role: null })] });
    expect(text(n)).not.toContain("Old mailing list");
    expect(n.covered).toBe(1);
    expect(n.checks).toEqual(["Left out until you say whether you're the controller or a processor (Your role): Old mailing list."]);
  });

  it("adds the right to withdraw consent only when something relies on it", () => {
    const rights = (n: ReturnType<typeof build>) => JSON.stringify(section(n, "Your rights"));
    expect(rights(build())).not.toContain("withdraw your consent");
    const withConsent = build({ activities: [activity({ lawfulBasis: "consent" })] });
    expect(rights(withConsent)).toContain("withdraw your consent at any time.");
  });

  it("ends the rights list as one sentence", () => {
    const list = section(build(), "Your rights")!.blocks.find((b) => b.kind === "list");
    const items = list?.kind === "list" ? list.items : [];
    expect(items.length).toBeGreaterThan(2);
    expect(items.at(0)).toMatch(/;$/);
    expect(items.at(-2)).toMatch(/; and$/);
    expect(items.at(-1)).toMatch(/\.$/);
  });

  it("names transfers outside Kenya and their safeguards", () => {
    const n = build({
      activities: [activity({ crossBorder: true, transferCountries: "Ireland", transferSafeguards: "Standard contractual clauses." })],
    });
    expect(text(n)).toContain("To Ireland. Standard contractual clauses.");
    expect(n.checks).toEqual([]);
  });

  it("asks for what's missing before publishing", () => {
    const n = build({
      org: { ...org, privacyEmail: null, address: null },
      activities: [activity({ name: "Mailing list", crossBorder: true, transferCountries: "Ireland" })],
    });
    expect(n.checks).toHaveLength(3);
    expect(n.checks[2]).toBe("Say how data sent outside Kenya is protected (Safeguards), for: Mailing list.");
  });

  it("shows each activity's security measures, and names those with none", () => {
    const n = build({ activities: [activity({}), activity({ name: "Fees", securityMeasures: "" })] });
    expect(text(n)).toContain('{"label":"Protected by","value":"Locked cabinets"}');
    expect(n.checks).toEqual(["Describe the security measures for: Fees."]);
  });

  it("adds a children section when an activity involves them, to be confirmed", () => {
    expect(section(build(), "Children")).toBeUndefined();
    const n = build({ activities: [activity({ involvesChildren: true })] });
    expect(JSON.stringify(section(n, "Children"))).toContain("unless the law doesn't require it");
    expect(n.checks).toHaveLength(1);
    expect(n.checks[0]).toContain("Children section");
  });

  it("cites a current controller certificate, not an expired one", () => {
    const reg = (expiresOn: string) => [{ role: "controller", certificateNumber: "ODPC-123", expiresOn }];
    expect(text(build({ registrations: reg("2027-01-01") }))).toContain("certificate ODPC-123");
    expect(text(build({ registrations: reg("2026-10-09") }))).not.toContain("ODPC-123");
  });
});

describe("privacyNoticeHtml", () => {
  it("escapes what the organisation wrote", () => {
    const html = privacyNoticeHtml(build({ activities: [activity({ purpose: "<script>alert(1)</script>" })] }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("keeps line breaks in the address", () => {
    const html = privacyNoticeHtml(build({ org: { ...org, address: "PO Box 1\nNairobi" } }));
    expect(html).toContain("PO Box 1<br>Nairobi");
  });
});
