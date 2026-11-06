import { and, eq, gte, isNotNull, isNull, lt, or, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { EmailMessage, SendEmail } from "./email";

/**
 * How the alert and reminder runners send each email once. A run claims the
 * email by inserting a row in its log (the unique key stops a second run),
 * sends it, then marks the row sent. If sending fails it deletes the row, so
 * the next run retries. A run that dies between claiming and marking leaves a
 * row with no sent_at; once it's older than CLAIM_LEASE_MS, another run takes
 * it over and sends the email again. So an email may go out twice, but is
 * never lost.
 */

/** How long a run's claim on an email holds before another run may take it over, say after the first died mid-send. */
export const CLAIM_LEASE_MS = 30 * 60 * 1000;

interface ClaimColumns {
  claimedAt: PgColumn;
  sentAt: PgColumn;
}

function staleBefore(now: Date): Date {
  return new Date(now.getTime() - CLAIM_LEASE_MS);
}

/** Log rows that rule an email out: sent, or claimed by a run still within its lease. */
export function sentOrClaimed(t: ClaimColumns, now: Date): SQL {
  return or(isNotNull(t.sentAt), gte(t.claimedAt, staleBefore(now)))!;
}

/** A claim another run may take over: never marked sent, and older than the lease. */
export function abandoned(t: ClaimColumns, now: Date): SQL {
  return and(isNull(t.sentAt), lt(t.claimedAt, staleBefore(now)))!;
}

/**
 * The claim this run made at `now`, still unsent: what it may mark sent or
 * release. Not one another run took over after this one's lease ran out.
 */
export function ownClaim(t: ClaimColumns, row: SQL, now: Date): SQL {
  return and(row, isNull(t.sentAt), eq(t.claimedAt, now))!;
}

/** Which of the recipients the mail server turned away, as reported by the sender. */
export function rejectedRecipients(to: string[], rejected: readonly string[] = []): string[] {
  const turnedAway = new Set(rejected.map((a) => a.trim().toLowerCase()));
  return to.filter((a) => turnedAway.has(a.trim().toLowerCase()));
}

/**
 * Sends a claimed email and settles the claim. If the send fails, or the mail
 * server rejects every recipient, the claim is released for the next run to
 * retry. Otherwise it's marked sent with the recipients the server accepted,
 * and any it rejected are reported as an error without a retry, since sending
 * again would repeat the email to everyone else.
 */
export async function deliverClaimed(
  sendEmail: SendEmail,
  message: EmailMessage,
  claim: { label: string; markSent: (recipients: string[]) => Promise<unknown>; release: () => Promise<unknown> },
): Promise<{ sent?: string[]; error?: string }> {
  const release = (error: string) =>
    claim
      .release()
      .catch((releaseErr) => console.error(`Failed to release ${claim.label} claim`, releaseErr))
      .then(() => ({ error }));

  let rejected: string[];
  try {
    rejected = rejectedRecipients(message.to, (await sendEmail(message))?.rejected);
  } catch (err) {
    return release(err instanceof Error ? err.message : String(err));
  }
  const sent = message.to.filter((a) => !rejected.includes(a));
  if (sent.length === 0) return release(`The mail server rejected every recipient: ${rejected.join(", ")}`);

  // If this fails the claim expires and the email goes out again.
  await claim.markSent(sent).catch((markErr) => console.error(`Failed to mark ${claim.label} sent`, markErr));
  return {
    sent,
    error: rejected.length > 0 ? `The mail server rejected ${rejected.join(", ")}; the others were sent the email.` : undefined,
  };
}
