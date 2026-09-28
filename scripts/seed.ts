// Demo data: npm run db:seed  →  sign in as demo@kinga.test / demo-password-1
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { memberships, organizations, processingActivities, registrations, users } from "@/db/schema";
import { addDays, addMonths, todayInKenya } from "@/lib/dates";
import { hashPassword } from "@/lib/password";
import { templatesForSector } from "@/lib/ropa";

const EMAIL = "demo@kinga.test";
const PASSWORD = "demo-password-1";

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
  .values({ email: EMAIL, name: "Wanjiru Kamau", passwordHash: await hashPassword(PASSWORD) })
  .returning();
const [org] = await db
  .insert(organizations)
  .values({ name: "Sunrise Academy", sector: "education", size: "micro_small", kraPin: "P051234567X" })
  .returning();
await db.insert(memberships).values({ userId: user.id, orgId: org.id, role: "owner" });

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
await db
  .insert(processingActivities)
  .values(templates.map(({ id, sectors: _s, ...t }) => ({ ...t, orgId: org.id, templateId: id })));

console.log(`Seeded "${org.name}" with ${templates.length} RoPA entries.`);
console.log(`Sign in as ${EMAIL} / ${PASSWORD}`);
process.exit(0);
