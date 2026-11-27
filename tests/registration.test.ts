import { describe, expect, it } from "vitest";
import {
  defaultExpiry,
  dueReminderThreshold,
  registrationStatus,
  reminderSubject,
  worstStatus,
} from "@/lib/registration";
import { parseRegistrationForm } from "@/lib/registration-form";

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

describe("parseRegistrationForm", () => {
  const form = (over: Record<string, string> = {}) => {
    const fd = new FormData();
    const fields = { role: "controller", ...over };
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    return fd;
  };
  const errors = (fd: FormData) => {
    const r = parseRegistrationForm(fd, today);
    return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
  };

  it("accepts a registration with only a role", () => {
    const r = parseRegistrationForm(form(), today);
    expect(r.success).toBe(true);
    expect(r.data).toMatchObject({ role: "controller", certificateNumber: null, appliedOn: null, issuedOn: null, expiresOn: null, notes: "" });
  });

  it("trims the certificate number and reads the dates", () => {
    const r = parseRegistrationForm(form({ certificateNumber: " ODPC-123 ", appliedOn: "2024-01-01", issuedOn: "2024-09-11" }), today);
    expect(r.data).toMatchObject({ certificateNumber: "ODPC-123", appliedOn: "2024-01-01", issuedOn: "2024-09-11" });
  });

  it("defaults the expiry to 24 months after the issue date", () => {
    const r = parseRegistrationForm(form({ issuedOn: "2024-09-11" }), today);
    expect(r.data).toMatchObject({ issuedOn: "2024-09-11", expiresOn: "2026-09-11" });
  });

  it("keeps an explicit expiry date", () => {
    const r = parseRegistrationForm(form({ issuedOn: "2024-09-11", expiresOn: "2027-01-01" }), today);
    expect(r.data).toMatchObject({ expiresOn: "2027-01-01" });
  });

  it("needs a role and valid dates", () => {
    expect(errors(form({ role: "" }))).toHaveProperty("role");
    expect(errors(form({ role: "landlord" }))).toHaveProperty("role");
    expect(errors(form({ appliedOn: "not-a-date" }))).toHaveProperty("appliedOn");
    expect(errors(form({ issuedOn: "2026-02-30" }))).toHaveProperty("issuedOn");
  });

  it("won't record an application or issue date in the future", () => {
    expect(errors(form({ appliedOn: "2026-09-29" }))).toEqual({ appliedOn: "This can't be in the future." });
    expect(errors(form({ issuedOn: "2026-09-29" }))).toEqual({ issuedOn: "This can't be in the future." });
    // Today is allowed.
    expect(parseRegistrationForm(form({ appliedOn: today, issuedOn: today, expiresOn: "2028-09-28" }), today).success).toBe(true);
  });

  it("requires the expiry to be after the issue date", () => {
    expect(errors(form({ issuedOn: "2026-01-01", expiresOn: "2026-01-01" }))).toHaveProperty("expiresOn");
    expect(errors(form({ issuedOn: "2026-01-01", expiresOn: "2025-12-31" }))).toHaveProperty("expiresOn");
  });

  it("needs an issue date when an expiry is given", () => {
    expect(errors(form({ expiresOn: "2027-01-01" }))).toEqual({ issuedOn: "Enter the issue date shown on the certificate." });
  });
});
