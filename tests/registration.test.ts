import { describe, expect, it } from "vitest";
import {
  defaultExpiry,
  dueReminderThreshold,
  registrationStatus,
  reminderSubject,
  worstStatus,
} from "@/lib/registration";

const today = "2026-09-28";

describe("registrationStatus", () => {
  it("is not_started with no dates", () => {
    expect(registrationStatus({ appliedOn: null, issuedOn: null, expiresOn: null }, today)).toBe("not_started");
  });

  it("is applied when filed but not issued", () => {
    expect(registrationStatus({ appliedOn: "2026-09-01", issuedOn: null, expiresOn: null }, today)).toBe("applied");
  });

  it("moves through active → renewal_due → expiring_soon → expired", () => {
    const s = (expiresOn: string) =>
      registrationStatus({ appliedOn: "2024-01-01", issuedOn: "2024-01-10", expiresOn }, today);
    expect(s("2027-01-01")).toBe("active"); // 95 days
    expect(s("2026-12-27")).toBe("renewal_due"); // 90 days
    expect(s("2026-10-28")).toBe("expiring_soon"); // 30 days
    expect(s("2026-09-28")).toBe("expiring_soon"); // expires today
    expect(s("2026-09-27")).toBe("expired");
  });

  it("treats a renewal filed after issue as applied, even after expiry", () => {
    const reg = { appliedOn: "2026-09-20", issuedOn: "2024-09-11", expiresOn: "2026-09-11" };
    expect(registrationStatus(reg, today)).toBe("applied");
    expect(registrationStatus({ ...reg, expiresOn: "2026-10-10" }, today)).toBe("applied");
  });

  it("ignores the original application date once issued", () => {
    const reg = { appliedOn: "2024-08-01", issuedOn: "2024-09-11", expiresOn: "2026-09-11" };
    expect(registrationStatus(reg, today)).toBe("expired");
  });
});

describe("defaultExpiry", () => {
  it("is 24 months after issue", () => {
    expect(defaultExpiry("2024-09-11")).toBe("2026-09-11");
  });
});

describe("worstStatus", () => {
  it("picks the most severe", () => {
    expect(worstStatus(["active", "expired", "renewal_due"])).toBe("expired");
    expect(worstStatus([])).toBe("not_started");
  });
});

describe("dueReminderThreshold", () => {
  const none = new Set<number>();

  it("sends nothing while more than 90 days remain", () => {
    expect(dueReminderThreshold("2027-01-01", today, none)).toBeNull();
  });

  it("sends the most recently crossed threshold only", () => {
    // 20 days left: the 30-day reminder, not 90/60 as well.
    expect(dueReminderThreshold("2026-10-18", today, none)).toBe(30);
  });

  it("does not resend a threshold already sent", () => {
    expect(dueReminderThreshold("2026-10-18", today, new Set([30]))).toBeNull();
  });

  it("fires on the exact threshold day", () => {
    expect(dueReminderThreshold("2026-10-05", today, none)).toBe(7);
    expect(dueReminderThreshold("2026-09-29", today, none)).toBe(1);
    expect(dueReminderThreshold("2026-09-28", today, none)).toBe(0);
  });

  it("sends post-expiry follow-ups, then stops", () => {
    expect(dueReminderThreshold("2026-09-21", today, new Set([0]))).toBe(-7);
    expect(dueReminderThreshold("2026-08-01", today, new Set([-30]))).toBeNull();
  });
});

describe("reminderSubject", () => {
  it("phrases future, today and past", () => {
    expect(reminderSubject("Acme", "controller", 30)).toBe("Acme: ODPC data controller registration expires in 30 days");
    expect(reminderSubject("Acme", "controller", 1)).toMatch(/tomorrow$/);
    expect(reminderSubject("Acme", "controller", 0)).toMatch(/today$/);
    expect(reminderSubject("Acme", "processor", -1)).toMatch(/expired 1 day ago$/);
    expect(reminderSubject("Acme", "processor", -7)).toMatch(/expired 7 days ago$/);
  });
});
