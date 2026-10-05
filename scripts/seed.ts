// Demo data: npm run db:seed  →  sign in as demo@kinga.test / demo-password-1
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  breachActivities,
  breaches,
  breachUpdates,
  dpiaRisks,
  dpias,
  invitations,
  memberships,
  organizations,
  payments,
  processingActivities,
  registrations,
  subjectRequests,
  users,
} from "@/db/schema";
import { addDays, addMonths, todayInKenya } from "@/lib/dates";
import { defaultReviewDate, draftDpia } from "@/lib/dpia";
import { hashPassword } from "@/lib/password";
import { addPeriod, PLAN_PRICES, toSubunits } from "@/lib/plans";
import { templatesForSector } from "@/lib/ropa";
import { INVITE_TTL_MS } from "@/lib/team";
import { hashToken, newToken } from "@/lib/tokens";

const EMAIL = "demo@kinga.test";
const PASSWORD = "demo-password-1";
// A colleague on the demo team, signed in with the same password.
const TEAMMATE = "otieno@kinga.test";

await db.delete(users).where(eq(sql`lower(${users.email})`, TEAMMATE));

const [existing] = await db.select().from(users).where(eq(sql`lower(${users.email})`, EMAIL));
if (existing) {
  // Deleting the user leaves the org orphaned, so remove orgs they own first.
  await db.transaction(async (tx) => {
    const owned = await tx
      .select({ orgId: memberships.orgId })
      .from(memberships)
      .where(and(eq(memberships.userId, existing.id), eq(memberships.role, "owner")));
    for (const { orgId } of owned) await tx.delete(organizations).where(eq(organizations.id, orgId));
    await tx.delete(users).where(eq(users.id, existing.id));
  });
}

const today = todayInKenya();
const [user] = await db
  .insert(users)
  .values({ email: EMAIL, name: "Wanjiru Kamau", passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() })
  .returning();
const [org] = await db
  .insert(organizations)
  .values({ name: "Sunrise Academy", sector: "education", size: "micro_small", kraPin: "P051234567X" })
  .returning();
await db.insert(memberships).values({ userId: user.id, orgId: org.id, role: "owner" });

// A member who works on the records, and a pending invitation for the bursar.
const [teammate] = await db
  .insert(users)
  .values({ email: TEAMMATE, name: "Brian Otieno", passwordHash: await hashPassword(PASSWORD), emailVerifiedAt: new Date() })
  .returning();
await db.insert(memberships).values({ userId: teammate.id, orgId: org.id, role: "member" });
await db.insert(invitations).values({
  tokenHash: hashToken(newToken()),
  orgId: org.id,
  email: "bursar@sunrise.example",
  role: "admin",
  invitedBy: user.id,
  expiresAt: new Date(Date.now() + INVITE_TTL_MS),
});

// The trial ended a month ago and they paid for a year (by M-Pesa).
const trialEndsAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
const paidUntil = addPeriod(trialEndsAt, "year");
await db.update(organizations).set({ trialEndsAt, paidUntil }).where(eq(organizations.id, org.id));
await db.insert(payments).values({
  orgId: org.id,
  reference: `kinga-demo-${crypto.randomUUID().replaceAll("-", "")}`,
  interval: "year",
  amount: toSubunits(PLAN_PRICES.micro_small.year),
  currency: "KES",
  status: "succeeded",
  channel: "mobile_money",
  paidAt: new Date(trialEndsAt.getTime() - 2 * 24 * 60 * 60 * 1000),
  periodStart: trialEndsAt,
  periodEnd: paidUntil,
  startedBy: user.id,
});

// Controller certificate expiring in 20 days; processor certificate lapsed last month.
const controllerExpiry = addDays(today, 20);
const processorExpiry = addDays(today, -17);
await db.insert(registrations).values([
  {
    orgId: org.id,
    role: "controller",
    certificateNumber: "ODPC/DC/2024/00123",
    appliedOn: addMonths(controllerExpiry, -25),
    issuedOn: addMonths(controllerExpiry, -24),
    expiresOn: controllerExpiry,
  },
  {
    orgId: org.id,
    role: "processor",
    certificateNumber: "ODPC/DP/2024/00456",
    appliedOn: addMonths(processorExpiry, -25),
    issuedOn: addMonths(processorExpiry, -24),
    expiresOn: processorExpiry,
    notes: "Needed because we run the parents' SMS service for two sister schools.",
  },
]);

const templates = templatesForSector("education");
const activities = await db
  .insert(processingActivities)
  .values(templates.map(({ id, sectors: _s, ...t }) => ({ ...t, orgId: org.id, templateId: id })))
  .returning();

// A breach discovered 30 hours ago, assessed but not yet notified: 42 hours left on the clock.
const HOUR = 3_600_000;
const discoveredAt = new Date(Date.now() - 30 * HOUR);
const [breach] = await db
  .insert(breaches)
  .values({
    orgId: org.id,
    title: "Fee balance list sent to wrong WhatsApp group",
    kind: "misdirected",
    description:
      "The bursar's assistant shared a spreadsheet of Form 2 fee balances, with parents' names and phone numbers, in the school's public alumni WhatsApp group instead of the finance team group. It was up for about 40 minutes before being deleted.",
    occurredAt: new Date(discoveredAt.getTime() - HOUR),
    discoveredAt,
    dataSubjects: "Parents and guardians of Form 2 students",
    approxSubjects: 142,
    dataCategories: "Names, phone numbers, fee balances",
    risk: "real_risk",
    riskNotes:
      "The alumni group has about 600 members. Fee arrears are financially sensitive and phone numbers could be used for fee-payment scams targeting parents.",
    measures:
      "Message deleted for everyone. Group admins asked members to delete any downloaded copies. Staff reminded to share finance files only through the school management system.",
    subjectAdvice:
      "Ignore any message asking you to pay fees to a number other than the school's paybill. Call the bursar's office to confirm any payment request.",
    contactPerson: `${user.name}, Deputy Principal, ${EMAIL}`,
    reportedBy: user.id,
  })
  .returning();
const feeActivity = activities.find((a) => a.templateId === "school-fees");
if (feeActivity) await db.insert(breachActivities).values({ breachId: breach.id, activityId: feeActivity.id });
await db.insert(breachUpdates).values([
  { breachId: breach.id, userId: user.id, note: "Breach logged.", createdAt: discoveredAt },
  {
    breachId: breach.id,
    userId: user.id,
    note: "Risk assessed: Real risk of harm to data subjects.",
    createdAt: new Date(discoveredAt.getTime() + 4 * HOUR),
  },
]);

// An approved DPIA for student records. CCTV is left flagged as needing one.
const studentRecords = activities.find((a) => a.templateId === "student-records");
if (studentRecords) {
  const draft = draftDpia(studentRecords, undefined);
  const approvedOn = addMonths(today, -2);
  const [dpia] = await db
    .insert(dpias)
    .values({
      orgId: org.id,
      activityId: studentRecords.id,
      title: draft.title,
      templateId: draft.templateId,
      description: draft.description,
      purposes: draft.purposes,
      necessity: draft.necessity,
      consultation: "Discussed with the board of management and the school management system vendor. Parents' association briefed at the AGM.",
      conclusion: "The processing can continue with the measures listed. Photo consent checks start from next term's admissions.",
      assessor: user.name,
      approvedBy: "James Otieno, Principal",
      approvedOn,
      reviewOn: defaultReviewDate(approvedOn),
      createdBy: user.id,
    })
    .returning();
  await db.insert(dpiaRisks).values(draft.risks.map((r, position) => ({ ...r, dpiaId: dpia.id, position })));
}

// An access request due in 2 days, and an erasure request answered last month.
await db.insert(subjectRequests).values([
  {
    orgId: org.id,
    kind: "access",
    receivedOn: addDays(today, -5),
    requesterName: "Grace Wanjiru",
    requesterContact: "0722 000 111",
    representative: "",
    channel: "Letter handed in at reception",
    details: "A parent asking for a copy of everything the school holds on her daughter (Form 3), including disciplinary records and CCTV of an incident on the bus.",
    identityCheck: "National ID checked against the admission form.",
    loggedBy: user.id,
  },
  {
    orgId: org.id,
    kind: "erasure",
    receivedOn: addDays(today, -40),
    requesterName: "Peter Kamau",
    requesterContact: "pkamau@example.com",
    channel: "Email to info@",
    details: "A former parent asking to be removed from the fees reminder SMS list now that his son has left.",
    identityCheck: "Replied from the email address on file.",
    outcome: "completed",
    respondedOn: addDays(today, -33),
    response: "Removed from the SMS list and the parent contact sheet. Fee records kept for 7 years under the tax law; told him so by email.",
    loggedBy: user.id,
  },
]);

console.log(
  `Seeded "${org.name}" with ${templates.length} RoPA entries, one DPIA, one open breach and two data subject requests.`,
);
console.log(`Sign in as ${EMAIL} / ${PASSWORD}`);
process.exit(0);
