import { describe, expect, it } from "vitest";
import { activitiesFor, buildPrivacyNotice, noticeAudiences, privacyNoticeHtml, type NoticeOrg } from "@/lib/privacy-notice";
import type { ActivityInput } from "@/lib/ropa";

const activity = (over: Partial<ActivityInput>): ActivityInput => ({
  name: "Admissions",
  purpose: "Admit and enrol pupils",
  lawfulBasis: "contract",
  role: "controller",
  provision: "",
  dataSubjects: ["Pupils", "Parents"],
  dataCategories: ["Name", "Date of birth"],
  sensitiveCategories: [],
  recipients: "",
  crossBorder: false,
  transferCountries: "",
  transferSafeguards: "",
  retentionPeriod: "Until the pupil leaves, plus 7 years",
  securityMeasures: "Locked cabinets",
  systems: "",
  owner: "",
  largeScale: false,
  systematicMonitoring: false,
  involvesChildren: false,
  ...over,
});

const org: NoticeOrg = {
  name: "Sunrise Academy",
  privacyContact: "The Bursar",
  privacyEmail: "privacy@sunrise.ac.ke",
  privacyPhone: null,
  address: "PO Box 1, Nairobi",
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
  it("covers only the chosen audience's activities", () => {
    const n = build({
      activities: [activity({ name: "Admissions", dataSubjects: ["Parents"] }), activity({ name: "Payroll", dataSubjects: ["Staff"] })],
      audience: "Staff",
    });
    expect(text(n)).toContain("Payroll");
    expect(text(n)).not.toContain("Admissions");
    expect(n.audience).toBe("Staff");
  });

  it("says whether giving the data is required, from the lawful basis", () => {
    expect(text(build({ activities: [activity({ lawfulBasis: "legal_obligation" })] }))).toContain("The law requires it.");
    expect(text(build({ activities: [activity({ lawfulBasis: "consent" })] }))).toContain("It's your choice");
  });

  it("prefers the organisation's own answer on whether the data is required", () => {
    const n = build({ activities: [activity({ lawfulBasis: "contract", provision: "Only the phone number is optional." })] });
    expect(text(n)).toContain("Only the phone number is optional.");
    expect(text(n)).not.toContain("Without it we can't.");
  });

  it("names the activities whose basis leaves that unanswered", () => {
    const cctv = activity({ name: "CCTV", lawfulBasis: "legitimate_interests" });
    const n = build({ activities: [activity({}), cctv] });
    expect(n.checks).toEqual(["Say whether people have to give the data, and what happens if they don't, for: CCTV."]);
    const answered = build({ activities: [{ ...cctv, provision: "Cameras cover the entrances." }] });
    expect(answered.checks).toEqual([]);
    expect(text(answered)).toContain("Cameras cover the entrances.");
  });

  it("leaves out what the organisation processes for someone else, and says so", () => {
    const n = build({ activities: [activity({}), activity({ name: "Client payroll", role: "processor" })] });
    expect(text(n)).not.toContain("Client payroll");
    expect(n.covered).toBe(1);
    expect(n.checks).toHaveLength(1);
    expect(n.checks[0]).toContain("Client payroll");
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
