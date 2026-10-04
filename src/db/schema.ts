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
import { BREACH_KIND_KEYS, BREACH_RISK_KEYS } from "../lib/breach";
import { LIKELIHOOD_KEYS, SEVERITY_KEYS } from "../lib/dpia";
import { LAWFUL_BASIS_KEYS, ORG_SIZE_KEYS, SECTOR_KEYS } from "../lib/dpa";

export const sectorEnum = pgEnum("sector", SECTOR_KEYS as [string, ...string[]]);
export const orgSizeEnum = pgEnum("org_size", ORG_SIZE_KEYS as [string, ...string[]]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "member"]);
export const registrationRoleEnum = pgEnum("registration_role", ["controller", "processor"]);
export const lawfulBasisEnum = pgEnum("lawful_basis", LAWFUL_BASIS_KEYS as [string, ...string[]]);
export const breachKindEnum = pgEnum("breach_kind", BREACH_KIND_KEYS as [string, ...string[]]);
export const breachRiskEnum = pgEnum("breach_risk", BREACH_RISK_KEYS as [string, ...string[]]);
export const likelihoodEnum = pgEnum("risk_likelihood", LIKELIHOOD_KEYS as [string, ...string[]]);
export const severityEnum = pgEnum("risk_severity", SEVERITY_KEYS as [string, ...string[]]);

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
    // Null until the user opens the link emailed to them; the app is gated on it.
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
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

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    // SHA-256 of the emailed token; the raw token is never stored.
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The address the link was sent to. Resetting verifies the email, so the
    // link only works if the user still has it.
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_reset_tokens_user_idx").on(t.userId)],
);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    // SHA-256 of the emailed token; the raw token is never stored.
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The address the link was sent to. Verifying only counts if the user still has it.
    email: text("email").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_verification_tokens_user_idx").on(t.userId)],
);

/** Fixed-window counters for login, signup and password-reset attempts. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  },
  (t) => [index("rate_limits_window_idx").on(t.windowStart)],
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
  (t) => [
    index("processing_activities_org_idx").on(t.orgId),
    uniqueIndex("processing_activities_org_template_idx").on(t.orgId, t.templateId),
  ],
);

/**
 * A personal data breach (s.43 of the Act). The notification clock starts at
 * `discoveredAt`: 72 hours to notify the ODPC when the organisation is the
 * controller, 48 hours to notify the controller when it is a processor.
 */
export const breaches = pgTable(
  "breaches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: breachKindEnum("kind").notNull(),
    // Whether the organisation holds this data as controller or processor.
    role: registrationRoleEnum("role").notNull().default("controller"),
    description: text("description").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    discoveredAt: timestamp("discovered_at", { withTimezone: true }).notNull(),
    dataSubjects: text("data_subjects").notNull().default(""),
    approxSubjects: integer("approx_subjects"),
    dataCategories: text("data_categories").notNull().default(""),
    sensitiveCategories: text("sensitive_categories").array().notNull().default(sql`'{}'::text[]`),
    // Encrypted or otherwise unintelligible to whoever got it.
    dataUnintelligible: boolean("data_unintelligible").notNull().default(false),
    risk: breachRiskEnum("risk").notNull().default("unassessed"),
    riskNotes: text("risk_notes").notNull().default(""),
    measures: text("measures").notNull().default(""),
    subjectAdvice: text("subject_advice").notNull().default(""),
    unauthorisedParty: text("unauthorised_party").notNull().default(""),
    contactPerson: text("contact_person").notNull().default(""),
    // The ODPC (as controller) or the controller (as processor).
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    notificationRef: text("notification_ref").notNull().default(""),
    delayReason: text("delay_reason").notNull().default(""),
    subjectsNotifiedAt: timestamp("subjects_notified_at", { withTimezone: true }),
    subjectsNotifiedHow: text("subjects_notified_how").notNull().default(""),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    lessons: text("lessons").notNull().default(""),
    reportedBy: uuid("reported_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("breaches_org_idx").on(t.orgId)],
);

/** RoPA activities a breach affected. */
export const breachActivities = pgTable(
  "breach_activities",
  {
    breachId: uuid("breach_id")
      .notNull()
      .references(() => breaches.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => processingActivities.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.breachId, t.activityId] })],
);

/** The incident log: timestamped notes on what was found and done. */
export const breachUpdates = pgTable(
  "breach_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    breachId: uuid("breach_id")
      .notNull()
      .references(() => breaches.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("breach_updates_breach_idx").on(t.breachId, t.createdAt)],
);

/** One row per breach alert email, so each kind goes out once per breach. */
export const breachAlertLog = pgTable(
  "breach_alert_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    breachId: uuid("breach_id")
      .notNull()
      .references(() => breaches.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    recipients: text("recipients").array().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("breach_alert_log_unique_idx").on(t.breachId, t.kind)],
);

/**
 * A Data Protection Impact Assessment (s.31). Usually covers one RoPA
 * activity; a DPIA for processing that hasn't started yet has no activity.
 */
export const dpias = pgTable(
  "dpias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id").references(() => processingActivities.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    templateId: text("template_id"),
    description: text("description").notNull().default(""),
    purposes: text("purposes").notNull().default(""),
    necessity: text("necessity").notNull().default(""),
    consultation: text("consultation").notNull().default(""),
    conclusion: text("conclusion").notNull().default(""),
    assessor: text("assessor").notNull().default(""),
    approvedBy: text("approved_by").notNull().default(""),
    approvedOn: date("approved_on", { mode: "string" }),
    reviewOn: date("review_on", { mode: "string" }),
    // Prior consultation with the Data Commissioner when high risk remains.
    odpcConsultedOn: date("odpc_consulted_on", { mode: "string" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("dpias_org_idx").on(t.orgId),
    // One DPIA per activity; reassessing means updating it.
    uniqueIndex("dpias_activity_idx").on(t.activityId),
  ],
);

/** A risk to data subjects identified in a DPIA, before and after mitigation. */
export const dpiaRisks = pgTable(
  "dpia_risks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dpiaId: uuid("dpia_id")
      .notNull()
      .references(() => dpias.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    likelihood: likelihoodEnum("likelihood").notNull(),
    severity: severityEnum("severity").notNull(),
    mitigation: text("mitigation").notNull().default(""),
    residualLikelihood: likelihoodEnum("residual_likelihood").notNull(),
    residualSeverity: severityEnum("residual_severity").notNull(),
  },
  (t) => [index("dpia_risks_dpia_idx").on(t.dpiaId, t.position)],
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  registrations: many(registrations),
  activities: many(processingActivities),
  breaches: many(breaches),
  dpias: many(dpias),
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
export type Breach = typeof breaches.$inferSelect;
export type Dpia = typeof dpias.$inferSelect;
export type DpiaRisk = typeof dpiaRisks.$inferSelect;
