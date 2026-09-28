import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { LAWFUL_BASIS_KEYS, ORG_SIZE_KEYS, SECTOR_KEYS } from "../lib/dpa";

export const sectorEnum = pgEnum("sector", SECTOR_KEYS as [string, ...string[]]);
export const orgSizeEnum = pgEnum("org_size", ORG_SIZE_KEYS as [string, ...string[]]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "member"]);
export const registrationRoleEnum = pgEnum("registration_role", ["controller", "processor"]);
export const lawfulBasisEnum = pgEnum("lawful_basis", LAWFUL_BASIS_KEYS as [string, ...string[]]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 of the cookie token; the raw token is never stored.
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  sector: sectorEnum("sector").notNull(),
  size: orgSizeEnum("size").notNull(),
  kraPin: text("kra_pin"),
  // Where renewal reminders go. Falls back to owners' emails when empty.
  reminderEmail: text("reminder_email"),
  ...timestamps,
});

export const memberships = pgTable(
  "memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId] }), index("memberships_org_idx").on(t.orgId)],
);

/** An ODPC registration certificate (one per role the organisation holds). */
export const registrations = pgTable(
  "registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: registrationRoleEnum("role").notNull(),
    certificateNumber: text("certificate_number"),
    appliedOn: date("applied_on", { mode: "string" }),
    issuedOn: date("issued_on", { mode: "string" }),
    expiresOn: date("expires_on", { mode: "string" }),
    notes: text("notes").notNull().default(""),
    ...timestamps,
  },
  (t) => [uniqueIndex("registrations_org_role_idx").on(t.orgId, t.role)],
);

/**
 * One row per reminder sent. The unique key (registration, expiry, threshold)
 * makes the reminder job idempotent, and a renewed certificate (new expiry)
 * starts a fresh set of reminders.
 */
export const reminderLog = pgTable(
  "reminder_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    registrationId: uuid("registration_id")
      .notNull()
      .references(() => registrations.id, { onDelete: "cascade" }),
    expiresOn: date("expires_on", { mode: "string" }).notNull(),
    thresholdDays: integer("threshold_days").notNull(),
    recipients: text("recipients").array().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reminder_log_unique_idx").on(t.registrationId, t.expiresOn, t.thresholdDays)],
);

/** One entry in the Record of Processing Activities. */
export const processingActivities = pgTable(
  "processing_activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    purpose: text("purpose").notNull(),
    lawfulBasis: lawfulBasisEnum("lawful_basis").notNull(),
    dataSubjects: text("data_subjects").array().notNull().default(sql`'{}'::text[]`),
    dataCategories: text("data_categories").array().notNull().default(sql`'{}'::text[]`),
    sensitiveCategories: text("sensitive_categories").array().notNull().default(sql`'{}'::text[]`),
    recipients: text("recipients").notNull().default(""),
    crossBorder: boolean("cross_border").notNull().default(false),
    transferCountries: text("transfer_countries").notNull().default(""),
    transferSafeguards: text("transfer_safeguards").notNull().default(""),
    retentionPeriod: text("retention_period").notNull(),
    securityMeasures: text("security_measures").notNull().default(""),
    systems: text("systems").notNull().default(""),
    owner: text("owner").notNull().default(""),
    largeScale: boolean("large_scale").notNull().default(false),
    systematicMonitoring: boolean("systematic_monitoring").notNull().default(false),
    involvesChildren: boolean("involves_children").notNull().default(false),
    templateId: text("template_id"),
    ...timestamps,
  },
  (t) => [index("processing_activities_org_idx").on(t.orgId)],
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  registrations: many(registrations),
  activities: many(processingActivities),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  user: one(users, { fields: [memberships.userId], references: [users.id] }),
  org: one(organizations, { fields: [memberships.orgId], references: [organizations.id] }),
}));

export const registrationsRelations = relations(registrations, ({ one, many }) => ({
  org: one(organizations, { fields: [registrations.orgId], references: [organizations.id] }),
  reminders: many(reminderLog),
}));

export const reminderLogRelations = relations(reminderLog, ({ one }) => ({
  registration: one(registrations, {
    fields: [reminderLog.registrationId],
    references: [registrations.id],
  }),
}));

export type User = typeof users.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Registration = typeof registrations.$inferSelect;
export type ProcessingActivity = typeof processingActivities.$inferSelect;
