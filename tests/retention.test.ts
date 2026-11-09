import { describe, expect, it } from "vitest";
import {
  activityNextRound,
  describeRetention,
  hasRetentionSchedule,
  nextRoundOn,
  retentionCutoff,
  retentionLengthText,
  retentionOf,
  retentionRoundsDue,
  roundIntervalText,
  type ScheduleActivity,
  type ScheduleDisposal,
} from "@/lib/retention";

const today = "2026-10-10";
const none = { retentionLength: null, retentionUnit: null, retentionFrom: "" };
const payroll = { retentionLength: 7, retentionUnit: "years", retentionFrom: "the end of employment" };
const cctv = { retentionLength: 30, retentionUnit: "days", retentionFrom: "recording" };
const visits = { retentionLength: 6, retentionUnit: "months", retentionFrom: "" };

describe("describing a period", () => {
  it("needs both a length and a unit it knows", () => {
    expect(hasRetentionSchedule(payroll)).toBe(true);
    expect(hasRetentionSchedule(none)).toBe(false);
    expect(hasRetentionSchedule({ ...payroll, retentionUnit: "decades" })).toBe(false);
    expect(hasRetentionSchedule({ ...payroll, retentionLength: 0 })).toBe(false);
  });

  it("reads as a length and what it counts from", () => {
    expect(describeRetention(payroll)).toBe("7 years from the end of employment");
    expect(describeRetention(visits)).toBe("6 months");
    expect(describeRetention(none)).toBeNull();
    expect(retentionLengthText({ ...payroll, retentionLength: 1 })).toBe("1 year");
    expect(retentionLengthText({ ...cctv, retentionLength: 1 })).toBe("1 day");
  });
});

describe("retentionCutoff", () => {
  it("draws the line one period before the day", () => {
    expect(retentionCutoff(payroll, today)).toBe("2019-10-10");
    expect(retentionCutoff(cctv, today)).toBe("2026-09-10");
    expect(retentionCutoff(visits, today)).toBe("2026-04-10");
  });

  it("keeps to the end of a shorter month", () => {
    expect(retentionCutoff(visits, "2026-08-31")).toBe("2026-02-28");
  });

  it("has no line without a fixed length", () => {
    expect(retentionCutoff(none, today)).toBeNull();
  });
});

describe("nextRoundOn", () => {
  it("comes once the period has passed", () => {
    expect(nextRoundOn(cctv, today)).toBe("2026-11-09");
    expect(nextRoundOn(visits, today)).toBe("2027-04-10");
    expect(nextRoundOn({ ...visits, retentionLength: 12 }, today)).toBe("2027-10-10");
    expect(roundIntervalText(cctv)).toBe("every 30 days");
    expect(roundIntervalText({ ...visits, retentionLength: 12 })).toBe("every 12 months");
  });

  it("comes after a year when the period is longer", () => {
    expect(nextRoundOn(payroll, today)).toBe("2027-10-10");
    expect(nextRoundOn({ ...cctv, retentionLength: 400 }, today)).toBe("2027-10-10");
    expect(roundIntervalText(payroll)).toBe("every year");
  });

  it("has no date without a fixed length", () => {
    expect(nextRoundOn(none, today)).toBeNull();
    expect(roundIntervalText(none)).toBeNull();
  });
});

describe("activityNextRound", () => {
  // Added to the RoPA on 1 Sept 2026, Nairobi time.
  const activity = (over: Partial<ScheduleActivity> = {}): ScheduleActivity => ({
    id: "a1",
    createdAt: new Date("2026-09-01T06:00:00Z"),
    ...cctv,
    ...over,
  });
  const round = (over: Partial<ScheduleDisposal> = {}): ScheduleDisposal => ({
    activityId: "a1",
    disposedOn: "2026-09-20",
    nextOn: null,
    reason: "retention",
    ...over,
  });

  it("counts the first round from when the activity was added", () => {
    expect(activityNextRound(activity(), [], today)).toEqual({ on: "2026-10-01", source: "retention", due: true });
    expect(activityNextRound(activity(), [], "2026-09-30")).toEqual({ on: "2026-10-01", source: "retention", due: false });
  });

  it("counts later rounds from the last one", () => {
    expect(activityNextRound(activity(), [round()], today)).toEqual({ on: "2026-10-20", source: "retention", due: false });
  });

  it("takes the date the last round set over the period", () => {
    const r = round({ nextOn: "2026-10-05" });
    expect(activityNextRound(activity(), [r], today)).toEqual({ on: "2026-10-05", source: "disposal", due: true });
    expect(activityNextRound(activity({ ...none }), [r], today)).toEqual({ on: "2026-10-05", source: "disposal", due: true });
  });

  it("ignores an earlier round's date once a later round is recorded", () => {
    const earlier = round({ disposedOn: "2026-08-01", nextOn: "2026-09-01" });
    expect(activityNextRound(activity(), [earlier, round()], today)?.on).toBe("2026-10-20");
  });

  it("lets a round that set a date speak for another on the same day", () => {
    const rounds = [round(), round({ nextOn: "2026-12-01" }), round()];
    expect(activityNextRound(activity(), rounds, today)).toEqual({ on: "2026-12-01", source: "disposal", due: false });
  });

  it("doesn't count an erasure or withdrawn consent as a round", () => {
    const rounds = [round(), round({ disposedOn: "2026-10-01", reason: "erasure" }), round({ disposedOn: "2026-10-02", reason: "consent_withdrawn" })];
    expect(activityNextRound(activity(), rounds, today)?.on).toBe("2026-10-20");
  });

  it("only counts the activity's own rounds", () => {
    const rounds = [round({ activityId: "a2", disposedOn: "2026-10-09" }), round({ activityId: null, disposedOn: "2026-10-09" })];
    expect(activityNextRound(activity(), rounds, today)?.on).toBe("2026-10-01");
  });

  it("has no round without a fixed length or a date of its own", () => {
    expect(activityNextRound(activity({ ...none }), [round()], today)).toBeNull();
  });
});

describe("retentionRoundsDue", () => {
  const createdAt = new Date("2026-01-05T06:00:00Z");
  const camera = { id: "cctv", createdAt, ...cctv };
  const staff = { id: "staff", createdAt, ...payroll };
  const notes = { id: "notes", createdAt, ...none };

  it("lists the rounds a retention period says are due", () => {
    const disposals: ScheduleDisposal[] = [{ activityId: "staff", disposedOn: "2026-06-01", nextOn: null, reason: "retention" }];
    expect(retentionRoundsDue([camera, staff, notes], disposals, today)).toEqual([{ activity: camera, on: "2026-02-04" }]);
  });

  it("leaves a due date a disposal set to the disposal", () => {
    const disposals: ScheduleDisposal[] = [{ activityId: "cctv", disposedOn: "2026-09-01", nextOn: "2026-10-01", reason: "retention" }];
    expect(retentionRoundsDue([camera], disposals, today)).toEqual([]);
  });
});

describe("retentionOf", () => {
  it("keeps only what a form needs", () => {
    const row = { id: "a1", name: "CCTV", retentionPeriod: "30 days", ...cctv, purpose: "Security" };
    expect(retentionOf(row)).toEqual({ id: "a1", name: "CCTV", retentionPeriod: "30 days", ...cctv });
  });
});
