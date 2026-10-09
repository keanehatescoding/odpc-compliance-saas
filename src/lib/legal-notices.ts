import { and, asc, eq, gt, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { legalNoticeLog, legalNotices, memberships, organizations, users } from "@/db/schema";
import { sellerFromEnv, type Seller } from "./billing";
import { addDays, formatDate, isIsoDate, todayInKenya } from "./dates";
import type { SendEmail } from "./email";
import { LEGAL_NOTICE_DAYS } from "./legal";

export type LegalNotice = typeof legalNotices.$inferSelect;

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
    .select({ notice: legalNotices, sent: sql<number>`count(${legalNoticeLog.userId})::int` })
    .from(legalNotices)
    .leftJoin(legalNoticeLog, eq(legalNoticeLog.noticeId, legalNotices.id))
    .where(gt(legalNotices.effectiveOn, todayInKenya(now)))
    .groupBy(legalNotices.id)
    .orderBy(asc(legalNotices.effectiveOn), asc(legalNotices.createdAt));
}

/** Owners of live organisations, with confirmed emails, not yet sent this notice (all of them for null: a preview). */
export async function legalNoticeRecipients(db: Db, noticeId: string | null) {
  return db
    .select({ userId: users.id, email: users.email, orgName: organizations.name })
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
        isNull(legalNoticeLog.userId),
      ),
    )
    .orderBy(asc(users.createdAt));
}

export function legalNoticeEmail(
  to: string,
  orgName: string,
  notice: Pick<LegalNotice, "effectiveOn" | "summary">,
  appUrl: string,
  seller: Seller,
) {
  const on = formatDate(notice.effectiveOn);
  return {
    to: [to],
    subject: `Kinga's terms are changing on ${on}`,
    text: [
      "Hello,",
      "",
      `We're changing the terms ${orgName} uses Kinga under. The change takes effect on ${on}.`,
      "",
      notice.summary,
      "",
      "The terms as they stand today:",
      "",
      `Terms of Service: ${appUrl}/terms`,
      `Privacy Notice: ${appUrl}/privacy`,
      `Data Processing Agreement: ${appUrl}/dpa`,
      "",
      `If you don't agree to the change, an owner can delete ${orgName} from Settings before ${on}.`,
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
 * email is claimed in legal_notice_log before it's sent and released if the
 * send fails, so overlapping runs don't send it twice and a failure is retried.
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

  for (const { notice } of await pendingLegalNotices(db, now)) {
    result.checked++;
    for (const r of await legalNoticeRecipients(db, notice.id)) {
      const [claimed] = await db
        .insert(legalNoticeLog)
        .values({ noticeId: notice.id, userId: r.userId, email: r.email, sentAt: now })
        .onConflictDoNothing()
        .returning({ userId: legalNoticeLog.userId });
      if (!claimed) continue;
      try {
        await sendEmail(legalNoticeEmail(r.email, r.orgName, notice, appUrl, seller));
        result.sent.push({ noticeId: notice.id, userId: r.userId, to: r.email });
      } catch (err) {
        result.failed.push({ noticeId: notice.id, userId: r.userId, error: err instanceof Error ? err.message : String(err) });
        await db
          .delete(legalNoticeLog)
          .where(and(eq(legalNoticeLog.noticeId, notice.id), eq(legalNoticeLog.userId, r.userId)))
          .catch((releaseErr) => console.error("Failed to release legal notice claim", releaseErr));
      }
    }
  }
  return result;
}
