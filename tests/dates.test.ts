import { describe, expect, it } from "vitest";
import { addDays, addMonths, daysBetween, isIsoDate, todayInKenya } from "@/lib/dates";

describe("dates", () => {
  it("uses Nairobi time for 'today'", () => {
    // 22:30 UTC on 10 Sep is 01:30 EAT on 11 Sep.
    expect(todayInKenya(new Date("2026-09-10T22:30:00Z"))).toBe("2026-09-11");
    expect(todayInKenya(new Date("2026-09-10T20:59:00Z"))).toBe("2026-09-10");
  });

  it("counts days between calendar dates", () => {
    expect(daysBetween("2026-08-28", "2026-09-11")).toBe(14);
    expect(daysBetween("2026-09-11", "2026-08-28")).toBe(-14);
    expect(daysBetween("2026-01-01", "2026-01-01")).toBe(0);
  });

  it("adds days and months, clamping month-ends", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addMonths("2024-02-29", 24)).toBe("2026-02-28");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-09-11", 24)).toBe("2028-09-11");
  });

  it("validates ISO dates", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("28/02/2026")).toBe(false);
  });
});
