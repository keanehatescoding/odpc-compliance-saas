import { describe, expect, it } from "vitest";
import { dpoDetailsChanged, dpoIssues, dpoTodo, nextDpoDetailsChangedOn, publishedDpo, type DpoLike } from "@/lib/dpo";

const none: DpoLike = {
  dpoDesignated: null,
  dpoName: null,
  dpoEmail: null,
  dpoPhone: null,
  dpoAppointedOn: null,
  dpoNotifiedOn: null,
  dpoDetailsChangedOn: null,
};
const sent: DpoLike = {
  dpoDesignated: true,
  dpoName: "Achieng Otieno",
  dpoEmail: "dpo@sunrise.test",
  dpoPhone: null,
  dpoAppointedOn: "2026-02-01",
  dpoNotifiedOn: "2026-02-10",
  dpoDetailsChangedOn: "2026-02-01",
};
const today = "2026-10-10";

describe("dpoIssues", () => {
  it("asks whether there is an officer until someone answers", () => {
    expect(dpoIssues(none)).toEqual([{ kind: "unanswered" }]);
    expect(dpoTodo(dpoIssues(none)[0])).toBe("Say whether you have a data protection officer");
  });

  it("asks nothing more of an organisation that has none", () => {
    expect(dpoIssues({ ...none, dpoDesignated: false })).toEqual([]);
  });

  it("is satisfied once the officer is named, reachable and reported", () => {
    expect(dpoIssues(sent)).toEqual([]);
    expect(dpoIssues({ ...sent, dpoEmail: null, dpoPhone: "+254 700 000 001" })).toEqual([]);
  });

  it("lists what a designated officer's record is missing", () => {
    expect(dpoIssues({ ...none, dpoDesignated: true, dpoName: "  " }).map((i) => i.kind)).toEqual(["no_name", "no_contact", "not_notified"]);
  });

  it("flags details changed after they were sent, but not on the day they were sent", () => {
    expect(dpoIssues({ ...sent, dpoDetailsChangedOn: "2026-05-01" })).toEqual([
      { kind: "changed_since_notified", changedOn: "2026-05-01", notifiedOn: "2026-02-10" },
    ]);
    expect(dpoIssues({ ...sent, dpoDetailsChangedOn: "2026-02-10" })).toEqual([]);
  });
});

describe("tracking when the details change", () => {
  it("counts a new officer, or a changed name, email or phone", () => {
    expect(dpoDetailsChanged(none, { dpoDesignated: true })).toBe(true);
    expect(dpoDetailsChanged(sent, { ...sent, dpoEmail: "new@sunrise.test" })).toBe(true);
    expect(dpoDetailsChanged(sent, { ...sent, dpoPhone: "" })).toBe(false);
    expect(dpoDetailsChanged(sent, { ...sent, dpoName: " Achieng Otieno " })).toBe(false);
    expect(dpoDetailsChanged(sent, { ...sent, dpoAppointedOn: "2026-03-01" })).toBe(false);
  });

  it("dates a change today, so it shows as not yet sent", () => {
    const changedOn = nextDpoDetailsChangedOn(sent, { ...sent, dpoEmail: "new@sunrise.test" }, today);
    expect(changedOn).toBe(today);
    expect(dpoIssues({ ...sent, dpoEmail: "new@sunrise.test", dpoDetailsChangedOn: changedOn }).map((i) => i.kind)).toEqual([
      "changed_since_notified",
    ]);
  });

  it("takes the sent date given in the same save as covering the new details", () => {
    // An organisation entering an officer it reported before it used the app.
    const after = { ...sent, dpoDetailsChangedOn: undefined };
    const changedOn = nextDpoDetailsChangedOn(none, after, today);
    expect(changedOn).toBeNull();
    expect(dpoIssues({ ...sent, dpoDetailsChangedOn: changedOn })).toEqual([]);
  });

  it("keeps the last change date when the details are untouched", () => {
    expect(nextDpoDetailsChangedOn(sent, { ...sent, dpoAppointedOn: "2026-01-15" }, today)).toBe("2026-02-01");
  });
});

describe("publishedDpo", () => {
  it("gives the details to print only for a designated officer with a way to reach them", () => {
    expect(publishedDpo(sent)).toEqual([
      { label: "Name", value: "Achieng Otieno" },
      { label: "Email", value: "dpo@sunrise.test" },
    ]);
    expect(publishedDpo({ ...sent, dpoEmail: null })).toBeNull();
    expect(publishedDpo({ ...sent, dpoDesignated: false })).toBeNull();
  });
});
