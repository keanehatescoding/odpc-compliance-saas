import { and, asc, eq, gt, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { invitations, memberships, organizations, users, type MemberRole } from "@/db/schema";
import type { EmailMessage } from "./email";
import { assignableRoles, canManage, ROLE_LABEL } from "./roles";
import { hashToken, newToken } from "./tokens";

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Expired invitations stay listed (so they can be resent) for this long, then are pruned. */
export const EXPIRED_INVITE_KEEP_MS = 30 * 24 * 60 * 60 * 1000;

const sameEmail = (column: typeof users.email | typeof invitations.email, email: string) =>
  eq(sql`lower(${column})`, email.toLowerCase());

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** The org's memberships, locked so concurrent team changes queue behind each other. */
async function lockTeam(tx: Tx, orgId: string) {
  return tx
    .select({ userId: memberships.userId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.orgId, orgId))
    .for("update");
}

export async function teamMembers(db: Db, orgId: string) {
  return db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
      role: memberships.role,
      joinedAt: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.orgId, orgId))
    .orderBy(asc(memberships.createdAt));
}

export async function pendingInvitations(db: Db, orgId: string) {
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
      invitedBy: users.name,
    })
    .from(invitations)
    .leftJoin(users, eq(users.id, invitations.invitedBy))
    .where(eq(invitations.orgId, orgId))
    .orderBy(asc(invitations.createdAt), asc(invitations.email));
}

/**
 * Invites `email` to the organisation, replacing any earlier invitation to
 * that address (so inviting again resends with a fresh link). Returns the
 * token for the emailed link, or an error to show the inviter.
 */
export async function issueInvitation(
  db: Db,
  p: { orgId: string; actorId: string; email: string; role: MemberRole },
  now: Date = new Date(),
): Promise<{ token: string } | { error: string }> {
  return db.transaction(async (tx) => {
    const team = await lockTeam(tx, p.orgId);
    const actor = team.find((m) => m.userId === p.actorId);
    if (!actor || !assignableRoles(actor.role).includes(p.role)) {
      return { error: `You can't invite people as ${ROLE_LABEL[p.role].toLowerCase()}s.` };
    }
    const [member] = await tx
      .select({ id: users.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(eq(memberships.orgId, p.orgId), sameEmail(users.email, p.email)))
      .limit(1);
    if (member) return { error: `${p.email} is already on the team.` };

    const [existing] = await tx
      .select({ role: invitations.role })
      .from(invitations)
      .where(and(eq(invitations.orgId, p.orgId), sameEmail(invitations.email, p.email)));
    // An admin can't quietly downgrade, or resend, an owner's invitation.
    if (existing && !canManage(actor.role, existing.role)) {
      return { error: `${p.email} already has an invitation that only an owner can change.` };
    }
    await tx.delete(invitations).where(and(eq(invitations.orgId, p.orgId), sameEmail(invitations.email, p.email)));

    const token = newToken();
    await tx.insert(invitations).values({
      tokenHash: hashToken(token),
      orgId: p.orgId,
      email: p.email,
      role: p.role,
      invitedBy: p.actorId,
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
      createdAt: now,
    });
    return { token };
  });
}

/** A live invitation, for showing the accept page. Null if unknown, expired or already used. */
export async function findInvitation(db: Db, token: string, now: Date = new Date()) {
  const [row] = await db
    .select({
      email: invitations.email,
      role: invitations.role,
      orgId: invitations.orgId,
      orgName: organizations.name,
      invitedBy: users.name,
    })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.orgId))
    .leftJoin(users, eq(users.id, invitations.invitedBy))
    .where(and(eq(invitations.tokenHash, hashToken(token)), gt(invitations.expiresAt, now)))
    .limit(1);
  return row ?? null;
}

export type AcceptError = "invalid" | "wrong_email" | "has_org";

/**
 * Adds an existing user to the inviting organisation and uses up the
 * invitation. The user must have the invited address. Opening the link proves
 * they receive mail there, so it also confirms their email. Each account
 * belongs to one organisation, so a user who already has one is refused.
 */
export async function acceptInvitation(
  db: Db,
  token: string,
  userId: string,
  now: Date = new Date(),
): Promise<{ orgId: string } | { error: AcceptError }> {
  return db.transaction(async (tx) => {
    // Locked so two invitations accepted at once can't both see "no organisation yet".
    const [user] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).for("update");
    const [invite] = await tx
      .select()
      .from(invitations)
      .where(and(eq(invitations.tokenHash, hashToken(token)), gt(invitations.expiresAt, now)))
      .for("update");
    if (!user || !invite) return { error: "invalid" };
    if (user.email.toLowerCase() !== invite.email.toLowerCase()) return { error: "wrong_email" };
    const [membership] = await tx
      .select({ orgId: memberships.orgId })
      .from(memberships)
      .where(eq(memberships.userId, userId))
      .limit(1);
    if (membership) return { error: "has_org" };

    await tx.insert(memberships).values({ userId, orgId: invite.orgId, role: invite.role, createdAt: now });
    await tx.delete(invitations).where(eq(invitations.id, invite.id));
    await tx.update(users).set({ emailVerifiedAt: now }).where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
    return { orgId: invite.orgId };
  });
}

/**
 * Creates an account for the invited address and adds it to the organisation.
 * The email counts as confirmed, since the link was sent there. Returns the
 * new user's id, or null if the invitation is no longer live. Throws on a
 * unique violation if an account already uses the address.
 */
export async function createAccountFromInvitation(
  db: Db,
  token: string,
  p: { name: string; passwordHash: string },
  now: Date = new Date(),
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .delete(invitations)
      .where(and(eq(invitations.tokenHash, hashToken(token)), gt(invitations.expiresAt, now)))
      .returning();
    if (!invite) return null;
    const [user] = await tx
      .insert(users)
      .values({ email: invite.email, name: p.name, passwordHash: p.passwordHash, emailVerifiedAt: now })
      .returning({ id: users.id });
    await tx.insert(memberships).values({ userId: user.id, orgId: invite.orgId, role: invite.role, createdAt: now });
    return user.id;
  });
}

/** Withdraws an invitation. Returns an error to show, or null on success (including if it was already gone). */
export async function revokeInvitation(db: Db, orgId: string, actorId: string, invitationId: string): Promise<string | null> {
  return db.transaction(async (tx) => {
    const team = await lockTeam(tx, orgId);
    const actor = team.find((m) => m.userId === actorId);
    const [invite] = await tx
      .select({ role: invitations.role })
      .from(invitations)
      .where(and(eq(invitations.id, invitationId), eq(invitations.orgId, orgId)));
    if (!invite) return null;
    if (!actor || !canManage(actor.role, invite.role)) return "Only an owner can withdraw an owner's invitation.";
    await tx.delete(invitations).where(eq(invitations.id, invitationId));
    return null;
  });
}

/** Changes a member's role. Returns an error to show, or null on success. */
export async function changeMemberRole(
  db: Db,
  p: { orgId: string; actorId: string; userId: string; role: MemberRole },
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const team = await lockTeam(tx, p.orgId);
    const actor = team.find((m) => m.userId === p.actorId);
    const target = team.find((m) => m.userId === p.userId);
    if (!target) return "That person isn't on the team any more.";
    if (target.role === p.role) return null;
    if (!actor || !canManage(actor.role, target.role) || !canManage(actor.role, p.role)) {
      return "Only an owner can make someone an owner or change an owner's role.";
    }
    if (target.role === "owner" && team.filter((m) => m.role === "owner").length === 1) {
      return "Every organisation needs an owner. Make someone else an owner first.";
    }
    await tx
      .update(memberships)
      .set({ role: p.role })
      .where(and(eq(memberships.orgId, p.orgId), eq(memberships.userId, p.userId)));
    return null;
  });
}

/** Removes someone from the team. Returns an error to show, or null on success. */
export async function removeMember(
  db: Db,
  p: { orgId: string; actorId: string; userId: string },
): Promise<string | null> {
  return db.transaction(async (tx) => {
    const team = await lockTeam(tx, p.orgId);
    const actor = team.find((m) => m.userId === p.actorId);
    const target = team.find((m) => m.userId === p.userId);
    if (!target) return null;
    if (p.userId === p.actorId) return "You can't remove yourself. Ask another owner or admin.";
    if (!actor || !canManage(actor.role, target.role)) return "Only an owner can remove an owner.";
    await tx.delete(memberships).where(and(eq(memberships.orgId, p.orgId), eq(memberships.userId, p.userId)));
    return null;
  });
}

/** Deletes invitations that expired more than EXPIRED_INVITE_KEEP_MS ago. */
export async function pruneInvitations(db: Db, now: Date = new Date()): Promise<void> {
  await db.delete(invitations).where(lte(invitations.expiresAt, new Date(now.getTime() - EXPIRED_INVITE_KEEP_MS)));
}

export function invitationEmail(
  to: string,
  p: { orgName: string; inviterName: string; role: MemberRole; link: string },
): EmailMessage {
  const role = `${p.role === "member" ? "a" : "an"} ${ROLE_LABEL[p.role].toLowerCase()}`;
  return {
    to: [to],
    subject: `${p.inviterName} invited you to ${p.orgName} on Kinga`,
    text: [
      "Hi,",
      "",
      `${p.inviterName} invited you to join ${p.orgName} on Kinga as ${role}. Kinga is where ${p.orgName} keeps its ODPC registration, records of processing, impact assessments, breach log and data subject requests.`,
      "",
      "To accept, open this link:",
      "",
      p.link,
      "",
      "The link expires in 7 days. If you weren't expecting this, you can ignore this email.",
    ].join("\n"),
  };
}
