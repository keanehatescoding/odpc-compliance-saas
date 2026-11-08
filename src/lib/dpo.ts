import { formatDate } from "./dates";

// The data protection officer. Section 24(1) of the Data Protection Act, 2019
// says a controller or processor "may designate or appoint" one, in particular
// where it is a public or private body, its core activities need regular and
// systematic monitoring of data subjects, or they consist of processing
// sensitive personal data. Section 24(6): a controller or processor "shall
// publish the contact details of the data protection officer on the website and
// communicate them to the Data Commissioner". Section 24(7) lists the DPO's
// duties. Plain-language summary; check against the Act and current ODPC
// guidance before relying on it.

export const DPO_PROVISION = "Data Protection Act, 2019, s.24";

export interface DpoLike {
  dpoDesignated: boolean | null;
  dpoName: string | null;
  dpoEmail: string | null;
  dpoPhone: string | null;
  dpoAppointedOn: string | null;
  dpoNotifiedOn: string | null;
  dpoDetailsChangedOn: string | null;
}

/** The details s.24(6) says are published and sent to the Data Commissioner. */
export const DPO_DETAILS = ["dpoName", "dpoEmail", "dpoPhone"] as const;

const norm = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** Whether an edit changed the DPO's published details, or designated one. */
export function dpoDetailsChanged(before: Partial<DpoLike>, after: Partial<DpoLike>): boolean {
  if (after.dpoDesignated && !before.dpoDesignated) return true;
  return DPO_DETAILS.some((k) => k in after && norm(before[k]) !== norm(after[k]));
}

/**
 * The dpoDetailsChangedOn to store after an edit. Changed details are dated
 * today, unless the same edit records when they were sent to the Data
 * Commissioner, which says the details as saved are the ones sent (such as an
 * organisation entering a DPO it reported before it used Kinga).
 */
export function nextDpoDetailsChangedOn(before: DpoLike, after: Partial<DpoLike>, today: string): string | null {
  if (!dpoDetailsChanged(before, after)) return before.dpoDetailsChangedOn;
  if ("dpoNotifiedOn" in after && norm(after.dpoNotifiedOn) !== norm(before.dpoNotifiedOn)) return before.dpoDetailsChangedOn;
  return today;
}

export type DpoIssue =
  | { kind: "unanswered" }
  | { kind: "no_name" }
  | { kind: "no_contact" }
  | { kind: "not_notified" }
  | { kind: "changed_since_notified"; changedOn: string; notifiedOn: string };

/** What the record still needs. None once a DPO is recorded and sent, or the organisation has said it has none. */
export function dpoIssues(o: DpoLike): DpoIssue[] {
  if (o.dpoDesignated === null) return [{ kind: "unanswered" }];
  if (!o.dpoDesignated) return [];
  const issues: DpoIssue[] = [];
  if (!o.dpoName?.trim()) issues.push({ kind: "no_name" });
  if (!o.dpoEmail?.trim() && !o.dpoPhone?.trim()) issues.push({ kind: "no_contact" });
  if (!o.dpoNotifiedOn) issues.push({ kind: "not_notified" });
  else if (o.dpoDetailsChangedOn && o.dpoDetailsChangedOn > o.dpoNotifiedOn) {
    issues.push({ kind: "changed_since_notified", changedOn: o.dpoDetailsChangedOn, notifiedOn: o.dpoNotifiedOn });
  }
  return issues;
}

/** What to do about an issue, as a next step. */
export function dpoTodo(issue: DpoIssue): string {
  switch (issue.kind) {
    case "unanswered":
      return "Say whether you have a data protection officer";
    case "no_name":
      return "Name your data protection officer";
    case "no_contact":
      return "Add an email address or phone number for your data protection officer";
    case "not_notified":
      return "Send your data protection officer's contact details to the Data Commissioner, and record the date";
    case "changed_since_notified":
      return `Send the data protection officer's new contact details to the Data Commissioner (changed ${formatDate(issue.changedOn)})`;
  }
}

/** The same issue as the compliance report states it. */
export function dpoFinding(issue: DpoIssue): string {
  switch (issue.kind) {
    case "unanswered":
      return "Whether the organisation has designated a data protection officer isn't recorded.";
    case "no_name":
      return "A data protection officer is designated, but who it is isn't recorded.";
    case "no_contact":
      return "No email address or phone number is recorded for the data protection officer, so there are no contact details to publish.";
    case "not_notified":
      return "The data protection officer's contact details aren't recorded as sent to the Data Commissioner.";
    case "changed_since_notified":
      return `The data protection officer's contact details changed on ${formatDate(issue.changedOn)}, after they were last sent to the Data Commissioner on ${formatDate(issue.notifiedOn)}.`;
  }
}

/** The DPO's contact as the privacy notice prints it, or null when there's none to print. */
export function publishedDpo(o: DpoLike): { label: string; value: string }[] | null {
  if (!o.dpoDesignated) return null;
  const items = [
    o.dpoName?.trim() && { label: "Name", value: o.dpoName.trim() },
    o.dpoEmail?.trim() && { label: "Email", value: o.dpoEmail.trim() },
    o.dpoPhone?.trim() && { label: "Phone", value: o.dpoPhone.trim() },
  ].filter((i): i is { label: string; value: string } => Boolean(i));
  return o.dpoEmail?.trim() || o.dpoPhone?.trim() ? items : null;
}

/** What s.24 asks of the person chosen, as a checklist beside the form. */
export const DPO_CHECKLIST = [
  "They have relevant academic or professional qualifications, including knowledge of data protection (s.24(5)).",
  "Their other duties, if they are on staff, don't conflict with the role (s.24(2)).",
  "Every entity they act for can reach them, if a group shares one (s.24(3)).",
  "Their contact details are on your website and in your privacy notice, and have been sent to the Data Commissioner (s.24(6)).",
  "They advise you and your staff, oversee compliance, train staff, advise on impact assessments and work with the Data Commissioner (s.24(7)).",
] as const;
