import { describe, expect, it } from "vitest";
import {
  breachStatus,
  dueBreachAlert,
  hoursLeft,
  notificationDeadline,
  notificationSections,
  outstandingTasks,
  subjectNoticeRequired,
  type NoticeBreach,
} from "@/lib/breach";
import { parseBreachForm } from "@/lib/breach-form";
import { formatDateTime, parseKenyaDateTime, toKenyaDateTimeLocal } from "@/lib/dates";

// 27 Sep 2026, 09:00 in Nairobi.
const discoveredAt = new Date("2026-09-27T06:00:00Z");
const at = (hoursAfter: number) => new Date(discoveredAt.getTime() + hoursAfter * 3_600_000);

function breach(over: Partial<NoticeBreach> = {}): NoticeBreach {
  return {
    role: "controller",
    discoveredAt,
    risk: "unassessed",
    dataUnintelligible: false,
    notifiedAt: null,
    subjectsNotifiedAt: null,
    closedAt: null,
    kind: "misdirected",
    description: "Fee list sent to the alumni WhatsApp group.",
    occurredAt: null,
    dataSubjects: "Parents",
    approxSubjects: 142,
    dataCategories: "Names, phone numbers",
    sensitiveCategories: [],
    riskNotes: "",
    measures: "",
    subjectAdvice: "",
    unauthorisedParty: "",
    contactPerson: "",
    delayReason: "",
    ...over,
  };
}

describe("Kenya date-times", () => {
  it("round-trips datetime-local values as Nairobi time", () => {
    expect(parseKenyaDateTime("2026-09-27T09:00")).toEqual(discoveredAt);
    expect(toKenyaDateTimeLocal(discoveredAt)).toBe("2026-09-27T09:00");
    expect(formatDateTime(discoveredAt)).toMatch(/27 Sept?\.? 2026.*09:00/);
  });

  it("rejects malformed values", () => {
    for (const v of ["", "2026-09-27", "2026-02-30T10:00", "2026-09-27T24:00", "2026-09-27T09:60", "junk"]) {
      expect(parseKenyaDateTime(v), v).toBeNull();
    }
  });
});

describe("deadlines and status", () => {
  it("gives controllers 72 hours and processors 48", () => {
    expect(notificationDeadline(breach())).toEqual(at(72));
    expect(notificationDeadline(breach({ role: "processor" }))).toEqual(at(48));
  });

  it("runs the clock until the risk is assessed as unlikely", () => {
    expect(breachStatus(breach(), at(10))).toBe("open");
    expect(breachStatus(breach(), at(73))).toBe("overdue");
    expect(breachStatus(breach({ risk: "real_risk" }), at(73))).toBe("overdue");
    expect(breachStatus(breach({ risk: "unlikely" }), at(73))).toBe("not_required");
  });

  it("always requires processors to notify the controller", () => {
    expect(breachStatus(breach({ role: "processor", risk: "unlikely" }), at(10))).toBe("open");
  });

  it("stops once notified or closed", () => {
    expect(breachStatus(breach({ notifiedAt: at(80) }), at(90))).toBe("notified");
    expect(breachStatus(breach({ notifiedAt: at(5), closedAt: at(20) }), at(90))).toBe("closed");
  });

  it("counts whole hours towards the deadline", () => {
    expect(hoursLeft(breach(), at(30.5))).toBe(41);
    expect(hoursLeft(breach(), at(72.2))).toBe(-1);
  });

  it("only asks controllers to tell affected people when harm is likely and the data was readable", () => {
    expect(subjectNoticeRequired(breach({ risk: "real_risk" }))).toBe(true);
    expect(subjectNoticeRequired(breach({ risk: "real_risk", dataUnintelligible: true }))).toBe(false);
    expect(subjectNoticeRequired(breach({ risk: "unassessed" }))).toBe(false);
    expect(subjectNoticeRequired(breach({ role: "processor", risk: "real_risk" }))).toBe(false);
  });

  it("lists outstanding tasks", () => {
    expect(outstandingTasks(breach())).toEqual(["Assess the risk of harm to the people affected", "Notify the ODPC"]);
    expect(outstandingTasks(breach({ risk: "real_risk", notifiedAt: at(20) }))).toEqual(["Tell the people affected"]);
    expect(outstandingTasks(breach({ closedAt: at(20) }))).toEqual([]);
  });
});

describe("dueBreachAlert", () => {
  const none = new Set<string>();

  it("sends only the most urgent stage", () => {
    expect(dueBreachAlert(breach(), at(1), none)).toBe("logged");
    expect(dueBreachAlert(breach(), at(50), none)).toBe("deadline_24h");
    expect(dueBreachAlert(breach(), at(73), none)).toBe("overdue");
  });

  it("skips stages already sent", () => {
    expect(dueBreachAlert(breach(), at(10), new Set(["logged"]))).toBeNull();
    expect(dueBreachAlert(breach(), at(50), new Set(["logged"]))).toBe("deadline_24h");
  });

  it("is silent once no notification is pending", () => {
    expect(dueBreachAlert(breach({ risk: "unlikely" }), at(50), none)).toBeNull();
    expect(dueBreachAlert(breach({ notifiedAt: at(40) }), at(50), none)).toBeNull();
  });
});

describe("parseBreachForm", () => {
  const now = at(30);
  const form = (fields: Record<string, string | string[]>) => {
    const fd = new FormData();
    const base = {
      title: "Fee list leak",
      kind: "misdirected",
      role: "controller",
      description: "Sent to the wrong WhatsApp group.",
      discoveredAt: "2026-09-27T09:00",
      risk: "unassessed",
    };
    for (const [k, v] of Object.entries({ ...base, ...fields })) {
      for (const x of [v].flat()) fd.append(k, x);
    }
    return parseBreachForm(fd, now);
  };
  const errors = (r: ReturnType<typeof form>) =>
    Object.fromEntries((r.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]));

  it("accepts the minimum needed to log a breach", () => {
    const r = form({});
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ discoveredAt, occurredAt: null, approxSubjects: null, sensitiveCategories: [] });
  });

  it("requires a discovery time that isn't in the future", () => {
    expect(errors(form({ discoveredAt: "" }))).toHaveProperty("discoveredAt");
    expect(errors(form({ discoveredAt: "2026-09-29T09:00" })).discoveredAt).toMatch(/future/);
  });

  it("checks the order of events", () => {
    const e = errors(form({ occurredAt: "2026-09-27T10:00", notifiedAt: "2026-09-27T08:00" }));
    expect(e.occurredAt).toMatch(/after you found out/);
    expect(e.notifiedAt).toMatch(/before you became aware/);
  });

  it("requires reasons for a late notification", () => {
    expect(form({ risk: "real_risk", notifiedAt: "2026-09-27T12:00" }).success).toBe(true);
    const late = { role: "processor", discoveredAt: "2026-09-25T09:00", notifiedAt: "2026-09-27T10:00" };
    expect(errors(form(late)).delayReason).toMatch(/48-hour/);
    expect(form({ ...late, delayReason: "Controller's contact was unreachable." }).success).toBe(true);
  });

  it("requires reasoning when a controller rules out harm", () => {
    expect(errors(form({ risk: "unlikely" })).riskNotes).toMatch(/why/);
    expect(form({ risk: "unlikely", riskNotes: "Encrypted laptop, key not compromised." }).success).toBe(true);
  });

  it("won't close a breach with a notification outstanding", () => {
    expect(errors(form({ risk: "real_risk", closedAt: "2026-09-28T09:00" })).closedAt).toMatch(/notified the ODPC/);
    expect(errors(form({ closedAt: "2026-09-28T09:00" })).closedAt).toBeDefined();
    expect(
      form({ risk: "real_risk", notifiedAt: "2026-09-27T20:00", closedAt: "2026-09-28T09:00" }).success,
    ).toBe(true);
  });

  it("validates the head count and sensitive categories", () => {
    expect(errors(form({ approxSubjects: "about 100" }))).toHaveProperty("approxSubjects");
    expect(form({ approxSubjects: "142", sensitiveCategories: ["Health status"] }).data).toMatchObject({
      approxSubjects: 142,
      sensitiveCategories: ["Health status"],
    });
    expect(errors(form({ sensitiveCategories: ["Favourite colour"] }))).toHaveProperty("sensitiveCategories");
  });
});

describe("notificationSections", () => {
  const ctx = { orgName: "Sunrise Academy", certificateNumber: "ODPC/DC/1", activities: ["School fees"], now: at(30) };

  it("marks the gaps still to fill", () => {
    const s = notificationSections(breach(), ctx);
    expect(s[0].body).toBe("Sunrise Academy\nODPC registration certificate ODPC/DC/1");
    expect(s.find((x) => x.heading === "Data and people affected")?.body).toContain("Processing activities affected: School fees");
    expect(s.filter((x) => x.missing).map((x) => x.heading)).toEqual([
      "Likely consequences",
      "Measures taken or proposed",
      "Recommended steps for affected people",
      "Contact person",
    ]);
    expect(s.find((x) => x.heading === "Identity of the unauthorised party")?.body).toBe("Not known");
  });

  it("adds reasons for delay only when late", () => {
    const has = (b: NoticeBreach, now: Date) =>
      notificationSections(b, { ...ctx, now }).some((x) => x.heading === "Reasons for the delay");
    expect(has(breach(), at(30))).toBe(false);
    expect(has(breach(), at(80))).toBe(true);
    expect(has(breach({ notifiedAt: at(70) }), at(80))).toBe(false);
    expect(has(breach({ notifiedAt: at(75) }), at(80))).toBe(true);
  });
});
