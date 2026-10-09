import { and, asc, eq, gt, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { legalNoticeLog, legalNotices, memberships, organizations, users } from "@/db/schema";
import { sellerFromEnv, type Seller } from "./billing";
import { addDays, formatDate, isIsoDate, todayInKenya } from "./dates";
import type { SendEmail } from "./email";
import { LEGAL_NOTICE_DAYS } from "./legal";

export type LegalNotice = typeof legalNotices.$inferSelect;

/** How long a run's claim on an email holds before another run may take it over, say after the first died mid-send. */
const CLAIM_LEASE_MS = 30 * 60 * 1000;

/** Why a notice can't be sent, or null. The Terms and DPA promise owners LEGAL_NOTICE_DAYS' warning. */
export function legalNoticeError(effectiveOn: string, summary: string, now: Date = new Date()): string | null {
  if (!isIsoDate(effectiveOn)) return "Give the date the change takes effect as YYYY-MM-DD.";
  const earliest = addDays(todayInKenya(now), LEGAL_NOTICE_DAYS);
  if (effectiveOn < earliest) {
    return `The change can take effect on ${formatDate(earliest)} at the earliest, ${LEGAL_NOTICE_DAYS} days from today.`;
  }
  if (!summary.trim()) return "Say what's changing.";
  return null;
}

/** Saves a notice for runLegalNotices to send, now and to anyone who becomes an owner before it takes effect. */
export async function createLegalNotice(
  db: Db,
  effectiveOn: string,
  summary: string,
  now: Date = new Date(),
): Promise<{ notice: LegalNotice } | { error: string }> {
  const error = legalNoticeError(effectiveOn, summary, now);
  if (error) return { error };
  const [notice] = await db.insert(legalNotices).values({ effectiveOn, summary: summary.trim() }).returning();
  return { notice };
}

/** Notices yet to take effect, soonest first, with how many owners each has gone to. */
export async function pendingLegalNotices(db: Db, now: Date = new Date()) {
  return db
    .select({ notice: legalNotices, sent: sql<number>`count(${legalNoticeLog.sentAt})::int` })
    .from(legalNotices)
    .leftJoin(legalNoticeLog, eq(legalNoticeLog.noticeId, legalNotices.id))
    .where(gt(legalNotices.effectiveOn, todayInKenya(now)))
    .groupBy(legalNotices.id)
    .orderBy(asc(legalNotices.effectiveOn), asc(legalNotices.createdAt));
}

/**
 * Owners of live organisations, with confirmed emails, not yet sent this notice and not claimed by a run
 * still within its lease (all of them for null: a preview). One row per owner, naming every organisation
 * they own, since each owner gets one email.
 */
export async function legalNoticeRecipients(db: Db, noticeId: string | null, now: Date = new Date()) {
  const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS);
  return db
    .select({
      userId: users.id,
      email: users.email,
      orgNames: sql<string[]>`array_agg(${organizations.name} order by ${organizations.createdAt})`,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(organizations, eq(organizations.id, memberships.orgId))
    .leftJoin(
      legalNoticeLog,
      and(noticeId ? eq(legalNoticeLog.noticeId, noticeId) : sql`false`, eq(legalNoticeLog.userId, users.id)),
    )
    .where(
      and(
        eq(memberships.role, "owner"),
        isNotNull(users.emailVerifiedAt),
        isNull(organizations.deletedAt),
        or(isNull(legalNoticeLog.userId), and(isNull(legalNoticeLog.sentAt), lt(legalNoticeLog.claimedAt, staleBefore))),
      ),
    )
    .groupBy(users.id)
    .orderBy(asc(users.createdAt));
}

export function legalNoticeEmail(
  to: string,
  orgNames: string[],
  notice: Pick<LegalNotice, "effectiveOn" | "summary">,
  appUrl: string,
  seller: Seller,
) {
  const on = formatDate(notice.effectiveOn);
  const orgs = new Intl.ListFormat("en-GB", { type: "conjunction" }).format(orgNames);
  const anyOrg = new Intl.ListFormat("en-GB", { type: "disjunction" }).format(orgNames);
  return {
    to: [to],
    subject: `Kinga's terms are changing on ${on}`,
    text: [
      "Hello,",
      "",
      `We're changing the terms ${orgs} ${orgNames.length === 1 ? "uses" : "use"} Kinga under. The change takes effect on ${on}.`,
      "",
      notice.summary,
      "",
      "The terms as they stand today:",
      "",
      `Terms of Service: ${appUrl}/terms`,
      `Privacy Notice: ${appUrl}/privacy`,
      `Data Processing Agreement: ${appUrl}/dpa`,
      "",
      `If you don't agree to the change, an owner can delete ${anyOrg} from Settings before ${on}.`,
      ...(seller.email ? ["", `Questions? Write to ${seller.email}.`] : []),
      "",
      `${seller.name}`,
    ].join("\n"),
  };
}

export interface LegalNoticeRunResult {
  checked: number;
  sent: { noticeId: string; userId: string; to: string }[];
  failed: { noticeId: string; userId: string; error: string }[];
}

/**
 * Emails each notice that hasn't taken effect yet to every owner not yet sent
 * it, one email each so owners don't see each other's addresses. Run hourly,
 * so someone who becomes an owner before the change still hears of it. Each
 * email is claimed in legal_notice_log before it's sent, marked sent once it
 * has gone, and released if the send fails, so overlapping runs don't send it
 * twice and a failure is retried. A claim left unfinished, because the run died
 * before marking it, expires after CLAIM_LEASE_MS and is sent again: an owner
 * might hear twice, but never not at all.
 */
export async function runLegalNotices(
  db: Db,
  sendEmail: SendEmail,
  opts: { now?: Date; appUrl?: string; seller?: Seller } = {},
): Promise<LegalNoticeRunResult> {
  const now = opts.now ?? new Date();
  const appUrl = opts.appUrl ?? process.env.APP_URL ?? "http://localhost:3000";
  const seller = opts.seller ?? sellerFromEnv();
  const result: LegalNoticeRunResult = { checked: 0, sent: [], failed: [] };

  const staleBefore = new Date(now.getTime() - CLAIM_LEASE_MS);

  for (const { notice } of await pendingLegalNotices(db, now)) {
    result.checked++;
    for (const r of await legalNoticeRecipients(db, notice.id, now)) {
      const mine = and(
        eq(legalNoticeLog.noticeId, notice.id),
        eq(legalNoticeLog.userId, r.userId),
        isNull(legalNoticeLog.sentAt),
        eq(legalNoticeLog.claimedAt, now),
      );
      const [claimed] = await db
        .insert(legalNoticeLog)
        .values({ noticeId: notice.id, userId: r.userId, email: r.email, claimedAt: now })
        .onConflictDoUpdate({
          target: [legalNoticeLog.noticeId, legalNoticeLog.userId],
          set: { email: r.email, claimedAt: now },
          setWhere: and(isNull(legalNoticeLog.sentAt), lt(legalNoticeLog.claimedAt, staleBefore)),
        })
        .returning({ userId: legalNoticeLog.userId });
      if (!claimed) continue;
      try {
        await sendEmail(legalNoticeEmail(r.email, r.orgNames, notice, appUrl, seller));
      } catch (err) {
        result.failed.push({ noticeId: notice.id, userId: r.userId, error: err instanceof Error ? err.message : String(err) });
        await db
          .delete(legalNoticeLog)
          .where(mine)
          .catch((releaseErr) => console.error("Failed to release legal notice claim", releaseErr));
        continue;
      }
      result.sent.push({ noticeId: notice.id, userId: r.userId, to: r.email });
      // If this fails the claim expires and the owner is emailed again.
      await db
        .update(legalNoticeLog)
        .set({ sentAt: now })
        .where(mine)
        .catch((markErr) => console.error("Failed to mark legal notice sent", markErr));
    }
  }
  return result;
}
