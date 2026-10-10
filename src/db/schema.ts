import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { BREACH_KIND_KEYS, BREACH_RISK_KEYS } from "../lib/breach";
import { LIKELIHOOD_KEYS, SEVERITY_KEYS } from "../lib/dpia";
import { BILLING_INTERVAL_KEYS, TRIAL_DAYS } from "../lib/plans";
import { LAWFUL_BASIS_KEYS, ORG_SIZE_KEYS, SECTOR_KEYS } from "../lib/dpa";
import { SERVICE_KEYS, SERVICE_ORDER_STATUS_KEYS } from "../lib/services";
import { REQUEST_KIND_KEYS, REQUEST_OUTCOME_KEYS } from "../lib/subject-request";

export const sectorEnum = pgEnum("sector", SECTOR_KEYS as [string, ...string[]]);
export const orgSizeEnum = pgEnum("org_size", ORG_SIZE_KEYS as [string, ...string[]]);
export const memberRoleEnum = pgEnum("member_role", ["owner", "admin", "member"]);
export const registrationRoleEnum = pgEnum("registration_role", ["controller", "processor"]);
export const lawfulBasisEnum = pgEnum("lawful_basis", LAWFUL_BASIS_KEYS as [string, ...string[]]);
export const breachKindEnum = pgEnum("breach_kind", BREACH_KIND_KEYS as [string, ...string[]]);
export const breachRiskEnum = pgEnum("breach_risk", BREACH_RISK_KEYS as [string, ...string[]]);
export const likelihoodEnum = pgEnum("risk_likelihood", LIKELIHOOD_KEYS as [string, ...string[]]);
export const severityEnum = pgEnum("risk_severity", SEVERITY_KEYS as [string, ...string[]]);
export const requestKindEnum = pgEnum("subject_request_kind", REQUEST_KIND_KEYS as [string, ...string[]]);
export const requestOutcomeEnum = pgEnum("subject_request_outcome", REQUEST_OUTCOME_KEYS as [string, ...string[]]);
export const billingIntervalEnum = pgEnum("billing_interval", BILLING_INTERVAL_KEYS as [string, ...string[]]);
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "succeeded", "failed"]);
export const paymentKindEnum = pgEnum("payment_kind", ["subscription", "service"]);
export const serviceEnum = pgEnum("service", SERVICE_KEYS as [string, ...string[]]);
export const serviceOrderStatusEnum = pgEnum("service_order_status", SERVICE_ORDER_STATUS_KEYS as [string, ...string[]]);
export const etimsInvoiceStatusEnum = pgEnum("etims_invoice_status", ["pending", "signed", "failed"]);

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
    // The terms (TERMS_VERSION in lib/legal) agreed to at signup. Null for
    // accounts made before signup asked.
    termsVersion: text("terms_version"),
    termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
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
  // How people reach the organisation about their personal data. Printed in
  // its privacy notice (s.29(e) of the Act asks for the controller's contacts).
  privacyContact: text("privacy_contact"),
  privacyEmail: text("privacy_email"),
  privacyPhone: text("privacy_phone"),
  address: text("address"),
  // New organisations start with a free trial. Existing ones got theirs when billing launched.
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true })
    .notNull()
    .default(sql.raw(`now() + interval '${TRIAL_DAYS} days'`)),
  // End of the last paid period. Each payment extends it; null until the first one.
  paidUntil: timestamp("paid_until", { withTimezone: true }),
  // Set while the saved card should be charged for another period when this
  // one ends; null when automatic renewal is off.
  autoRenewInterval: billingIntervalEnum("auto_renew_interval"),
  // Set when an owner deletes the organisation. Its records and team are gone;
  // the row stays with its payments, which tax law says to keep (see lib/account).
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  ...timestamps,
});

/** Receipt numbers, issued in order as payments are credited. */
export const receiptNumberSeq = pgSequence("receipt_number_seq");

/**
 * A payment through Paystack, for the subscription or a one-off service.
 * Created as pending when checkout starts; Paystack's webhook (or the return
 * from checkout) marks it succeeded once, extending the organisation's paid
 * period or marking its service order paid.
 */
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Our reference, sent to Paystack and echoed back in its webhook.
    reference: text("reference").notNull(),
    kind: paymentKindEnum("kind").notNull().default("subscription"),
    // Set for subscription payments only.
    interval: billingIntervalEnum("interval"),
    // Set for service payments only.
    service: serviceEnum("service"),
    // Expected amount in subunits (cents), fixed when checkout starts.
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    status: paymentStatusEnum("status").notNull().default("pending"),
    // Paystack's channel, e.g. "card" or "mobile_money".
    channel: text("channel"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    periodStart: timestamp("period_start", { withTimezone: true }),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    // Set when credited. The name and KRA PIN are copied from the organisation
    // then, so a receipt doesn't change if they are edited later.
    receiptNumber: integer("receipt_number"),
    billedName: text("billed_name"),
    billedKraPin: text("billed_kra_pin"),
    // The payer agreed to save their card for automatic renewal. Only acted on
    // if they pay by card and Paystack says the card can be charged again.
    saveCard: boolean("save_card").notNull().default(false),
    startedBy: uuid("started_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_reference_idx").on(t.reference),
    uniqueIndex("payments_receipt_number_idx").on(t.receiptNumber),
    index("payments_org_idx").on(t.orgId, t.createdAt),
    check("payments_interval_check", sql`(${t.kind} = 'subscription') = (${t.interval} is not null)`),
    check("payments_service_check", sql`(${t.kind} = 'service') = (${t.service} is not null)`),
  ],
);

/**
 * A one-off service an organisation has asked for. Created with its payment
 * when checkout starts, and goes away with it if that checkout is never paid.
 * Kinga staff move it on at /staff/orders or with `npm run service-order`.
 */
export const serviceOrders = pgTable(
  "service_orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // The payment says which service and what it cost.
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    status: serviceOrderStatusEnum("status").notNull().default("awaiting_payment"),
    // What the customer wants covered.
    notes: text("notes"),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("service_orders_payment_idx").on(t.paymentId), index("service_orders_org_idx").on(t.orgId, t.createdAt)],
);

/**
 * The card an organisation renews with: a Paystack authorization that can be
 * charged again. One per organisation; saving another replaces it.
 */
export const savedCards = pgTable(
  "saved_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    authorizationCode: text("authorization_code").notNull(),
    // The Paystack customer the card belongs to; charges must use it.
    email: text("email").notNull(),
    brand: text("brand"),
    last4: text("last4"),
    expMonth: integer("exp_month"),
    expYear: integer("exp_year"),
    savedBy: uuid("saved_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("saved_cards_org_idx").on(t.orgId)],
);

/**
 * Each automatic renewal charge, claimed before it is made, keyed by the
 * access end date it renews, so two jobs can't charge the same period twice.
 */
export const renewalAttempts = pgTable(
  "renewal_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    // 1, 2 or 3.
    attempt: integer("attempt").notNull(),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    // Why it failed, from Paystack, if it did.
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("renewal_attempts_unique_idx").on(t.orgId, t.endsAt, t.attempt)],
);

/** One row per billing email, keyed by the access end date it was about, so paying starts a fresh set. */
export const billingAlertLog = pgTable(
  "billing_alert_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    recipients: text("recipients").array().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("billing_alert_log_unique_idx").on(t.orgId, t.kind, t.endsAt)],
);

/**
 * A change to the Terms, DPA, Privacy Notice, sub-processors or prices, which
 * owners are emailed about before it takes effect (scripts/legal-notice.ts).
 */
export const legalNotices = pgTable("legal_notices", {
  id: uuid("id").primaryKey().defaultRandom(),
  // The day the change applies, in Nairobi.
  effectiveOn: date("effective_on").notNull(),
  // What's changing, as written in the email.
  summary: text("summary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per owner emailed about a notice, so each is told once, including owners who join before it takes effect.
 * A row with no sent_at is a run's claim on the email; another run takes it over once it's old enough.
 */
export const legalNoticeLog = pgTable(
  "legal_notice_log",
  {
    noticeId: uuid("notice_id")
      .notNull()
      .references(() => legalNotices.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.noticeId, t.userId] })],
);

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

/** A pending invitation to join an organisation. Accepting it deletes the row. */
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // SHA-256 of the emailed token; the raw token is never stored.
    tokenHash: text("token_hash").notNull(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Only someone who can read mail at this address can accept.
    email: text("email").notNull(),
    role: memberRoleEnum("role").notNull(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("invitations_token_idx").on(t.tokenHash),
    // One pending invitation per address per organisation; inviting again replaces it.
    uniqueIndex("invitations_org_email_idx").on(t.orgId, sql`lower(${t.email})`),
  ],
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

/**
 * A request from a data subject exercising their rights: access, correction,
 * erasure and so on. The response deadline runs in calendar days from
 * `receivedOn`, by kind (see lib/subject-request).
 */
export const subjectRequests = pgTable(
  "subject_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: requestKindEnum("kind").notNull(),
    receivedOn: date("received_on", { mode: "string" }).notNull(),
    requesterName: text("requester_name").notNull(),
    requesterContact: text("requester_contact").notNull().default(""),
    // Someone acting for the data subject, e.g. a parent or an advocate.
    representative: text("representative").notNull().default(""),
    channel: text("channel").notNull().default(""),
    details: text("details").notNull(),
    identityCheck: text("identity_check").notNull().default(""),
    // Null while the request is open; set together with respondedOn.
    outcome: requestOutcomeEnum("outcome"),
    respondedOn: date("responded_on", { mode: "string" }),
    // What was done, or the reasons for declining.
    response: text("response").notNull().default(""),
    loggedBy: uuid("logged_by").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [index("subject_requests_org_idx").on(t.orgId, t.receivedOn)],
);

/** One row per deadline alert email, so each kind goes out once per request. */
export const subjectRequestAlertLog = pgTable(
  "subject_request_alert_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => subjectRequests.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    recipients: text("recipients").array().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("subject_request_alert_log_unique_idx").on(t.requestId, t.kind)],
);

/** eTIMS invoice numbers. KRA expects each branch's to run 1, 2, 3, ... */
export const etimsInvoiceSeq = pgSequence("etims_invoice_seq");

/**
 * Money Paystack has refunded on a payment. Refunds are made in the Paystack
 * dashboard; each one is recorded from Paystack's refund.processed webhook,
 * or by `npm run refunds`, looked up by its transaction.
 */
export const refunds = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    // Paystack's refund ID, so each refund is recorded once.
    paystackId: text("paystack_id").notNull(),
    // In subunits (cents).
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    refundedAt: timestamp("refunded_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("refunds_paystack_idx").on(t.paystackId), index("refunds_payment_idx").on(t.paymentId)],
);

/**
 * A credited payment's sale, or a refund's credit note, as sent to KRA eTIMS
 * for signing. A sale is created with its invoice number when the payment is
 * credited (if eTIMS is set up), and a credit note when a refund of an
 * invoiced payment is recorded. Each is sent until KRA signs it, with the
 * same invoice number every attempt; a credit note waits for its sale.
 */
export const etimsInvoices = pgTable(
  "etims_invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    invcNo: integer("invc_no")
      .notNull()
      .default(sql`nextval('etims_invoice_seq')`),
    // Set on a credit note: the refund it's for. The sale is the payment's invoice without one.
    refundId: uuid("refund_id").references(() => refunds.id, { onDelete: "cascade" }),
    status: etimsInvoiceStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    // When to send it next; moved on while an attempt is under way, so two can't send at once.
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    lastError: text("last_error"),
    // KRA's signature, once signed. The PIN, branch and control unit are those it was sent from.
    tin: text("tin"),
    bhfId: text("bhf_id"),
    sdcId: text("sdc_id"),
    rcptNo: integer("rcpt_no"),
    totRcptNo: integer("tot_rcpt_no"),
    intrlData: text("intrl_data"),
    rcptSign: text("rcpt_sign"),
    sdcDateTime: timestamp("sdc_date_time", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("etims_invoices_payment_idx").on(t.paymentId).where(sql`${t.refundId} is null`),
    uniqueIndex("etims_invoices_refund_idx").on(t.refundId),
    uniqueIndex("etims_invoices_invc_no_idx").on(t.invcNo),
    index("etims_invoices_due_idx").on(t.nextAttemptAt).where(sql`${t.status} = 'pending'`),
  ],
);

/** What part of the organisation's records an activity log entry is about. */
export const activityAreaEnum = pgEnum("activity_area", [
  "registration",
  "ropa",
  "dpia",
  "breach",
  "request",
  "team",
  "organization",
  "billing",
]);

/**
 * Who changed what, and when: one row per change someone made to the
 * organisation's records, team or settings, written in the same transaction
 * as the change. Nothing in the app edits or deletes a row, except deleting
 * the organisation. The actor's name is copied in, so the entry still reads
 * the same after they leave. The subject has no foreign key, so entries
 * outlive the record they describe, including the one saying it was deleted.
 */
export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    actorName: text("actor_name").notNull(),
    area: activityAreaEnum("area").notNull(),
    subjectId: uuid("subject_id"),
    // Follows the actor's name: "edited the controller registration (expiry date)".
    summary: text("summary").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("activity_log_org_idx").on(t.orgId, t.createdAt),
    index("activity_log_subject_idx").on(t.subjectId, t.createdAt),
  ],
);

export const organizationsRelations = relations(organizations, ({ many }) => ({
  memberships: many(memberships),
  registrations: many(registrations),
  activities: many(processingActivities),
  breaches: many(breaches),
  dpias: many(dpias),
  subjectRequests: many(subjectRequests),
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
export type SavedCard = typeof savedCards.$inferSelect;
export type MemberRole = (typeof memberRoleEnum.enumValues)[number];
export type Registration = typeof registrations.$inferSelect;
export type ProcessingActivity = typeof processingActivities.$inferSelect;
export type Breach = typeof breaches.$inferSelect;
export type Dpia = typeof dpias.$inferSelect;
export type DpiaRisk = typeof dpiaRisks.$inferSelect;
export type SubjectRequest = typeof subjectRequests.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type ServiceOrder = typeof serviceOrders.$inferSelect;
export type EtimsInvoice = typeof etimsInvoices.$inferSelect;
export type Refund = typeof refunds.$inferSelect;
export type ActivityArea = (typeof activityAreaEnum.enumValues)[number];
