import { describe, expect, it } from "vitest";
import {
  buildComplianceReport,
  type ReportActivity,
  type ReportBreach,
  type ReportConsent,
  type ReportInput,
  type ReportProcessor,
  type ReportSectionKey,
  type ReportTraining,
} from "@/lib/compliance-report";

// 10 Oct 2026, 09:00 in Nairobi.
const now = new Date("2026-10-10T06:00:00Z");
const at = (iso: string) => new Date(`${iso}:00+03:00`);

function activity(over: Partial<ReportActivity> = {}): ReportActivity {
  return {
    id: "a1",
    name: "Fee payments",
    purpose: "Collect school fees",
    lawfulBasis: "contract",
    role: "controller",
    provision: "Required to enrol",
    dataSubjects: ["Parents"],
    dataCategories: ["Name", "Phone number"],
    sensitiveCategories: [],
    recipients: "",
    crossBorder: false,
    transferCountries: "",
    transferSafeguards: "",
    retentionPeriod: "7 years",
    securityMeasures: "Access limited to the bursar",
    systems: "",
    owner: "",
    largeScale: false,
    systematicMonitoring: false,
    involvesChildren: false,
    updatedAt: at("2026-09-01T10:00"),
    ...over,
  };
}

function breach(over: Partial<ReportBreach> = {}): ReportBreach {
  return {
    title: "Lost laptop",
    role: "controller",
    discoveredAt: at("2026-08-01T09:00"),
    risk: "real_risk",
    dataUnintelligible: false,
    notifiedAt: at("2026-08-02T09:00"),
    subjectsNotifiedAt: at("2026-08-03T09:00"),
    closedAt: at("2026-08-10T09:00"),
    ...over,
  };
}

function processor(over: Partial<ReportProcessor> = {}): ReportProcessor {
  return {
    id: "p1",
    name: "Payroll Bureau",
    service: "Runs payroll",
    location: "Nairobi",
    outsideKenya: false,
    guarantees: "ODPC processor certificate seen",
    contractSignedOn: "2026-01-15",
    contractReviewOn: "2027-01-15",
    ...over,
  };
}

function training(over: Partial<ReportTraining> = {}): ReportTraining {
  return {
    id: "t1",
    title: "Staff induction",
    heldOn: "2026-03-02",
    audience: "All staff",
    attendeeCount: 12,
    evidence: "Signed register in the HR file",
    refresherOn: "2027-03-02",
    refreshesId: null,
    ...over,
  };
}

function consent(over: Partial<ReportConsent> = {}): ReportConsent {
  return {
    id: "c1",
    name: "Newsletter emails",
    activityId: "a2",
    method: "online",
    wording: "I agree to receive the school newsletter by email.",
    evidence: "Sign-up log in the mailing tool",
    withdrawal: "Unsubscribe link in every email",
    parental: false,
    guardianCheck: "",
    conditional: false,
    reviewOn: "2027-06-01",
    ...over,
  };
}
const newsletter = (over: Partial<ReportActivity> = {}) => activity({ id: "a2", name: "Newsletter", lawfulBasis: "consent", provision: "", ...over });

/** An organisation with everything in order. */
function input(over: Partial<ReportInput> = {}): ReportInput {
  return {
    org: { privacyContact: "The Bursar", privacyEmail: "privacy@sunrise.test", privacyPhone: null, address: "PO Box 1, Nakuru" },
    registrations: [{ role: "controller", certificateNumber: "DC-001", appliedOn: "2025-12-01", issuedOn: "2026-01-10", expiresOn: "2028-01-10" }],
    activities: [activity()],
    dpias: [],
    dpiaRisks: [],
    breaches: [],
    requests: [],
    processors: [processor()],
    processorLinks: [{ processorId: "p1", activityId: "a1" }],
    training: [training()],
    consents: [],
    now,
    ...over,
  };
}

function section(over: Partial<ReportInput>, key: ReportSectionKey) {
  return buildComplianceReport(input(over)).sections.find((s) => s.key === key)!;
}
const fact = (s: { facts: { label: string; value: string }[] }, label: string) => s.facts.find((f) => f.label === label)?.value;

describe("buildComplianceReport", () => {
  it("finds nothing open when every record is in order", () => {
    const report = buildComplianceReport(input());
    expect(report.openCount).toBe(0);
    expect(report.sections.map((s) => s.key)).toEqual(["registration", "ropa", "notice", "consent", "dpia", "breach", "request", "processor", "training"]);
    expect(report.preparedOn).toBe("2026-10-10");
    expect(report.periodFrom).toBe("2025-10-10");
  });

  it("dates the report in Nairobi, not UTC", () => {
    // 23:30 UTC on the 9th is already the 10th in Nairobi.
    expect(buildComplianceReport(input({ now: new Date("2026-10-09T23:30:00Z") })).preparedOn).toBe("2026-10-10");
  });

  it("counts the open items across sections", () => {
    const report = buildComplianceReport(input({ registrations: [], processors: [processor({ contractSignedOn: null, guarantees: "" })] }));
    expect(report.openCount).toBe(3);
  });
});

describe("registration", () => {
  const reg = { role: "controller", certificateNumber: "DC-001", appliedOn: "2023-12-01", issuedOn: "2024-01-10" };

  it("says when nothing is recorded", () => {
    const s = section({ registrations: [] }, "registration");
    expect(s.open).toEqual(["No ODPC registration is recorded."]);
    expect(s.table).toBeUndefined();
  });

  it("reports an expired certificate with how long ago", () => {
    const s = section({ registrations: [{ ...reg, expiresOn: "2026-09-23" }] }, "registration");
    expect(s.open).toEqual(["The data controller certificate expired on 23 Sept 2026, 17 days ago, and no renewal application is recorded."]);
    expect(s.table!.rows[0]).toEqual(["Data controller", "DC-001", "10 Jan 2024", "23 Sept 2026", "Expired"]);
  });

  it("reports a certificate inside the renewal window", () => {
    const s = section({ registrations: [{ ...reg, expiresOn: "2026-10-30" }] }, "registration");
    expect(s.open).toEqual(["The data controller certificate expires on 30 Oct 2026, in 20 days, and no renewal application is recorded."]);
  });

  it("leaves a renewal that has been applied for out of the open items", () => {
    const s = section({ registrations: [{ ...reg, appliedOn: "2026-09-01", expiresOn: "2026-09-23" }] }, "registration");
    expect(s.open).toEqual([]);
    expect(s.table!.rows[0][4]).toBe("Application pending");
  });

  it("notices a role the RoPA shows but no registration covers", () => {
    const s = section({ activities: [activity(), activity({ id: "a2", name: "Bulk SMS for clients", role: "processor" })] }, "registration");
    expect(s.open).toEqual(["The RoPA records 1 activity carried out as a data processor, but no data processor registration is recorded."]);
  });
});

describe("record of processing", () => {
  it("summarises roles, lawful bases and the riskier kinds of processing", () => {
    const s = section(
      {
        activities: [
          activity(),
          activity({ id: "a2", name: "Health records", lawfulBasis: "consent", sensitiveCategories: ["Health"], involvesChildren: true, updatedAt: at("2026-10-02T08:00") }),
          activity({ id: "a3", name: "Cloud backups", role: "processor", crossBorder: true, transferSafeguards: "Standard clauses" }),
        ],
      },
      "ropa",
    );
    expect(fact(s, "Processing activities recorded")).toBe("3");
    expect(fact(s, "Role")).toBe("2 as controller, 1 as processor");
    expect(fact(s, "Lawful bases relied on")).toBe("Consent of the data subject (1); Performance of a contract with the data subject (2)");
    expect(fact(s, "Involving sensitive personal data")).toBe("1");
    expect(fact(s, "Involving children's data")).toBe("1");
    expect(fact(s, "Transferring data outside Kenya")).toBe("1");
    expect(fact(s, "Last changed")).toBe("2 Oct 2026");
    expect(s.open).toEqual([]);
  });

  it("names the activities with something missing", () => {
    const s = section(
      {
        activities: [
          activity({ role: null }),
          activity({ id: "a2", name: "CCTV", securityMeasures: "" }),
          activity({ id: "a3", name: "Cloud backups", crossBorder: true }),
        ],
      },
      "ropa",
    );
    expect(fact(s, "Role")).toBe("2 as controller, 0 as processor, 1 not yet said");
    expect(s.open).toEqual([
      "Whether the organisation is the controller or a processor isn't recorded for: Fee payments.",
      "No security measures are recorded for: CCTV.",
      "No safeguards are recorded for the transfer outside Kenya in: Cloud backups.",
    ]);
  });

  it("says when the RoPA is empty", () => {
    const s = section({ activities: [], processorLinks: [] }, "ropa");
    expect(s.facts).toEqual([{ label: "Processing activities recorded", value: "0" }]);
    expect(s.open).toEqual(["No processing activities are recorded."]);
  });
});

describe("privacy notice", () => {
  it("covers only what the organisation controls", () => {
    const s = section({ activities: [activity(), activity({ id: "a2", name: "Bulk SMS", role: "processor", dataSubjects: ["Clients' customers"] })] }, "notice");
    expect(fact(s, "Activities the notice describes")).toBe("1");
    expect(fact(s, "Written for")).toBe("Parents");
    expect(fact(s, "Contact for data protection")).toBe("The Bursar, privacy@sunrise.test");
  });

  it("flags missing contact details", () => {
    const s = section({ org: { privacyContact: null, privacyEmail: null, privacyPhone: null, address: null } }, "notice");
    expect(fact(s, "Contact for data protection")).toBe("Not recorded");
    expect(s.open).toHaveLength(2);
  });
});

describe("impact assessments", () => {
  const cctv = activity({ id: "a2", name: "CCTV", systematicMonitoring: true });
  const dpia = { id: "d1", title: "CCTV DPIA", activityId: "a2", approvedOn: "2026-03-01", reviewOn: "2027-03-01", odpcConsultedOn: null };

  it("flags a screened activity with no assessment", () => {
    const s = section({ activities: [activity(), cctv] }, "dpia");
    expect(fact(s, "Activities flagged by screening")).toBe("1");
    expect(fact(s, "Of those, with an approved assessment")).toBe("0");
    expect(s.open).toEqual(["Screening flags these activities as likely to be high risk, and no impact assessment has been started: CCTV."]);
  });

  it("lists an approved assessment with its highest remaining risk", () => {
    const s = section(
      {
        activities: [activity(), cctv],
        dpias: [dpia],
        dpiaRisks: [
          { dpiaId: "d1", residualLikelihood: "remote", residualSeverity: "minimal" },
          { dpiaId: "d1", residualLikelihood: "possible", residualSeverity: "significant" },
        ],
      },
      "dpia",
    );
    expect(fact(s, "Of those, with an approved assessment")).toBe("1");
    expect(s.table!.rows).toEqual([["CCTV DPIA", "CCTV", "Approved", "1 Mar 2026", "1 Mar 2027", "Medium", "—"]]);
    expect(s.open).toEqual([]);
  });

  it("reports drafts and reviews that have come due", () => {
    const s = section(
      {
        activities: [activity(), cctv],
        dpias: [
          { ...dpia, reviewOn: "2026-10-01" },
          { id: "d2", title: "Biometric attendance", activityId: null, approvedOn: null, reviewOn: null, odpcConsultedOn: null },
        ],
      },
      "dpia",
    );
    expect(s.open).toEqual(["Not yet approved: Biometric attendance.", "CCTV DPIA was due for review on 1 Oct 2026."]);
    expect(s.table!.rows[1].slice(0, 3)).toEqual(["Biometric attendance", "Planned processing", "Draft"]);
  });

  it("doesn't count a draft as covering its flagged activity", () => {
    const s = section({ activities: [cctv], dpias: [{ ...dpia, approvedOn: null, reviewOn: null }], processorLinks: [] }, "dpia");
    expect(fact(s, "Of those, with an approved assessment")).toBe("0");
  });
});

describe("breaches", () => {
  it("counts notifications made in and out of time over the period", () => {
    const s = section(
      {
        breaches: [
          breach(),
          breach({ title: "Misdirected email", notifiedAt: at("2026-08-05T09:00") }),
          breach({ title: "Paper file left out", risk: "unlikely", notifiedAt: null, subjectsNotifiedAt: null }),
          breach({ title: "Old incident", discoveredAt: at("2025-06-01T09:00"), notifiedAt: at("2025-06-02T09:00") }),
        ],
      },
      "breach",
    );
    expect(fact(s, "Breaches logged in the period")).toBe("3");
    expect(fact(s, "Needing notification")).toBe("2");
    expect(fact(s, "Notified within the deadline")).toBe("1");
    expect(fact(s, "Notified after the deadline")).toBe("1");
    expect(fact(s, "Not yet notified")).toBe("0");
    expect(s.table!.rows.map((r) => r[1])).not.toContain("Old incident");
    expect(s.table!.rows.find((r) => r[1] === "Lost laptop")![2]).toBe("2 Aug 2026, 09:00 (on time)");
    expect(s.table!.rows.find((r) => r[1] === "Misdirected email")![2]).toBe("5 Aug 2026, 09:00 (after the deadline)");
    expect(s.table!.rows.find((r) => r[1] === "Paper file left out")![2]).toBe("Not required: harm assessed as unlikely");
    expect(s.open).toEqual([]);
  });

  it("reports a breach whose deadline is still running", () => {
    const s = section({ breaches: [breach({ discoveredAt: at("2026-10-09T09:00"), notifiedAt: null, subjectsNotifiedAt: null, closedAt: null })] }, "breach");
    expect(s.table!.rows[0][2]).toBe("Due by 12 Oct 2026, 09:00");
    expect(s.open).toEqual(["Lost laptop: still to do: notify the ODPC; tell the people affected."]);
  });

  it("says when the deadline has passed, even for a breach from before the period", () => {
    const s = section(
      { breaches: [breach({ discoveredAt: at("2025-06-01T09:00"), risk: "unassessed", notifiedAt: null, subjectsNotifiedAt: null, closedAt: null })] },
      "breach",
    );
    expect(fact(s, "Breaches logged in the period")).toBe("0");
    expect(s.table!.rows[0][2]).toBe("Overdue since 4 Jun 2025, 09:00");
    expect(s.open[0]).toMatch(/The notification deadline has passed\.$/);
  });

  it("shows a breach closed without ever being notified", () => {
    const s = section({ breaches: [breach({ notifiedAt: null })] }, "breach");
    expect(s.table!.rows[0][2]).toBe("Closed without a notification on record");
    expect(fact(s, "Not yet notified")).toBe("1");
    expect(s.open).toEqual(["Lost laptop: closed, but still to do: notify the ODPC. The notification deadline has passed."]);
  });

  it("keeps an old breach on the report when it was closed with a duty unmet", () => {
    const old = { discoveredAt: at("2025-06-01T09:00"), notifiedAt: at("2025-06-02T09:00"), closedAt: at("2025-06-10T09:00") };
    const untold = section({ breaches: [breach({ ...old, subjectsNotifiedAt: null })] }, "breach");
    expect(untold.table!.rows).toHaveLength(1);
    expect(untold.open).toEqual(["Lost laptop: closed, but still to do: tell the people affected."]);

    const done = section({ breaches: [breach({ ...old, subjectsNotifiedAt: at("2025-06-03T09:00") })] }, "breach");
    expect(done.table).toBeUndefined();
    expect(done.open).toEqual([]);
  });
});

describe("data subject requests", () => {
  const request = { kind: "access", receivedOn: "2026-09-01", outcome: "completed", respondedOn: "2026-09-05" };

  it("counts by type without naming anyone", () => {
    const s = section(
      {
        requests: [
          request,
          { ...request, respondedOn: "2026-09-20" },
          { kind: "erasure", receivedOn: "2026-09-10", outcome: "declined", respondedOn: "2026-09-15" },
          { kind: "access", receivedOn: "2026-10-08", outcome: null, respondedOn: null },
          { ...request, receivedOn: "2025-01-05", respondedOn: "2025-01-06" },
        ],
      },
      "request",
    );
    expect(fact(s, "Requests received in the period")).toBe("4");
    expect(fact(s, "Answered within the time allowed")).toBe("2");
    expect(fact(s, "Answered late")).toBe("1");
    expect(fact(s, "Declined, with reasons")).toBe("1");
    expect(fact(s, "Awaiting a response")).toBe("1");
    expect(s.table!.rows).toEqual([
      ["Access to their data", "7 days", "3", "1", "1", "1"],
      ["Delete their data", "14 days", "1", "1", "0", "0"],
    ]);
    expect(s.open).toEqual([]);
  });

  it("reports a request past its deadline", () => {
    const s = section({ requests: [{ kind: "access", receivedOn: "2026-10-01", outcome: null, respondedOn: null }] }, "request");
    expect(s.open).toEqual(["Access request received 1 Oct 2026: not answered, 2 days overdue (7 days allowed)."]);
  });
});

describe("consent", () => {
  it("has nothing to say when nothing relies on consent", () => {
    const s = section({}, "consent");
    expect(fact(s, "Activities relying on consent")).toBe("0");
    expect(s.table).toBeUndefined();
    expect(s.open).toEqual([]);
  });

  it("reports an activity relying on consent with no record, but not one processed for someone else", () => {
    const s = section({ activities: [activity(), newsletter(), newsletter({ id: "a3", name: "Client campaigns", role: "processor" })] }, "consent");
    expect(fact(s, "Activities relying on consent")).toBe("1");
    expect(fact(s, "Of those, with a consent record")).toBe("0");
    expect(s.open).toEqual(["No consent record covers: Newsletter."]);
  });

  it("is satisfied by a complete record", () => {
    const s = section({ activities: [activity(), newsletter()], consents: [consent()] }, "consent");
    expect(fact(s, "Of those, with a consent record")).toBe("1");
    expect(s.open).toEqual([]);
    expect(s.table!.rows).toEqual([["Newsletter emails", "Newsletter", "Online form or tick-box", "Sign-up log in the mailing tool", "1 Jun 2027", "In place"]]);
  });

  it("reports what a record can't prove, and reviews that have come due", () => {
    const s = section(
      {
        activities: [activity(), newsletter()],
        consents: [consent({ wording: "", evidence: "", withdrawal: "" }), consent({ id: "c2", name: "Event photos", reviewOn: "2026-10-01" })],
      },
      "consent",
    );
    expect(s.open).toEqual([
      "The wording people agree to isn't recorded for: Newsletter emails.",
      "Where the proof of consent is kept isn't recorded for: Newsletter emails.",
      "How people withdraw isn't recorded for: Newsletter emails.",
      "Event photos was due for review on 1 Oct 2026.",
    ]);
    expect(s.table!.rows.map((r) => r[5])).toEqual(["Proof incomplete", "Review due"]);
  });

  it("checks children's consent, the lawful basis and whether the consent is free", () => {
    const s = section(
      {
        activities: [activity(), newsletter({ involvesChildren: true })],
        consents: [
          consent(),
          consent({ id: "c2", name: "Trip photos", parental: true }),
          consent({ id: "c3", name: "Fee reminders", activityId: "a1", conditional: true }),
          consent({ id: "c4", name: "Old form", activityId: null }),
        ],
      },
      "consent",
    );
    expect(fact(s, "Given by a parent or guardian")).toBe("1");
    expect(s.open).toEqual([
      "Not linked to a processing activity: Old form.",
      "Newsletter involves children's data, but Newsletter emails doesn't record a parent's or guardian's consent.",
      "Fee reminders is recorded for Fee payments, whose lawful basis in the RoPA isn't consent.",
      "How the parent or guardian is verified isn't recorded for: Trip photos.",
      "A service is refused to people who don't agree, so the consent may not be freely given (s.32(4)), for: Fee reminders.",
    ]);
  });
});

describe("processors", () => {
  it("reports missing contracts, overdue reviews and unchecked security", () => {
    const s = section(
      {
        processors: [
          processor(),
          processor({ id: "p2", name: "SMS Gateway", contractSignedOn: null, contractReviewOn: null, guarantees: "" }),
          processor({ id: "p3", name: "School system", contractReviewOn: "2026-10-01" }),
        ],
      },
      "processor",
    );
    expect(fact(s, "Processors on the register")).toBe("3");
    expect(fact(s, "With a written contract")).toBe("2");
    expect(s.open).toEqual([
      "No written contract is recorded with: SMS Gateway.",
      "The contract with School system was due for review on 1 Oct 2026.",
      "How their security was checked isn't recorded for: SMS Gateway.",
    ]);
    expect(s.table!.rows[1]).toEqual(["SMS Gateway", "Runs payroll", "Nairobi", "—", "—", "No written contract"]);
  });

  it("notices a processor abroad whose activities record no transfer", () => {
    const abroad = processor({ outsideKenya: true, location: "" });
    const s = section({ processors: [abroad] }, "processor");
    expect(fact(s, "Holding data outside Kenya")).toBe("1");
    expect(s.table!.rows[0][2]).toBe("Outside Kenya");
    expect(s.open).toEqual(["Payroll Bureau holds data outside Kenya, but the RoPA records no transfer for: Fee payments."]);

    const recorded = section({ processors: [abroad], activities: [activity({ crossBorder: true, transferSafeguards: "Standard clauses" })] }, "processor");
    expect(recorded.open).toEqual([]);
  });
});

describe("training", () => {
  it("says when nothing is recorded", () => {
    const s = section({ training: [] }, "training");
    expect(s.open).toEqual(["No data protection training is recorded."]);
    expect(fact(s, "Most recent session")).toBe("None recorded");
    expect(s.table).toBeUndefined();
  });

  it("counts the sessions and attendances in the period", () => {
    const s = section(
      {
        training: [
          training(),
          training({ id: "t2", title: "Accounts office briefing", heldOn: "2026-08-14", attendeeCount: null }),
          training({ id: "t3", title: "Old induction", heldOn: "2024-02-01", refresherOn: null }),
        ],
      },
      "training",
    );
    expect(fact(s, "Sessions held in the period")).toBe("2");
    expect(fact(s, "Attendances at those sessions")).toBe("12, with 1 session not counted");
    expect(fact(s, "Most recent session")).toBe("14 Aug 2026");
    expect(s.table!.rows).toEqual([
      ["14 Aug 2026", "Accounts office briefing", "All staff", "Not counted", "2 Mar 2027", "Up to date"],
      ["2 Mar 2026", "Staff induction", "All staff", "12", "2 Mar 2027", "Up to date"],
    ]);
    expect(s.open).toEqual([]);
  });

  it("keeps an older session on while its refresher is outstanding", () => {
    const old = training({ heldOn: "2025-09-01", refresherOn: "2026-09-01", evidence: "" });
    const s = section({ training: [old] }, "training");
    expect(fact(s, "Sessions held in the period")).toBe("0");
    expect(s.open).toEqual([
      "The refresher for Staff induction, held 1 Sept 2025, was due on 1 Sept 2026.",
      "Where the attendance record is kept isn't recorded for: Staff induction.",
    ]);
    expect(s.table!.rows[0][5]).toBe("Refresher due");
  });

  it("stops asking once a later session is recorded as the refresher", () => {
    const old = training({ heldOn: "2025-09-01", refresherOn: "2026-09-01" });
    const s = section({ training: [old, training({ id: "t2", title: "Staff refresher", heldOn: "2026-09-20", refresherOn: "2027-09-20", refreshesId: "t1" })] }, "training");
    expect(s.open).toEqual([]);
    expect(s.table!.rows.map((r) => r[1])).toEqual(["Staff refresher"]);
  });

  it("says when the last session is more than a year old and nothing else is due", () => {
    const s = section({ training: [training({ heldOn: "2025-06-01", refresherOn: null })] }, "training");
    expect(s.open).toEqual(["No training is recorded in the last 12 months. The most recent session was on 1 Jun 2025."]);
    expect(s.table).toBeUndefined();
  });
});
