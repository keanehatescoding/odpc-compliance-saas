CREATE TYPE "public"."breach_kind" AS ENUM('unauthorised_access', 'misdirected', 'loss_theft', 'ransomware', 'insider', 'disclosure', 'destruction', 'other');--> statement-breakpoint
CREATE TYPE "public"."breach_risk" AS ENUM('unassessed', 'unlikely', 'real_risk');--> statement-breakpoint
CREATE TABLE "breach_activities" (
	"breach_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	CONSTRAINT "breach_activities_breach_id_activity_id_pk" PRIMARY KEY("breach_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE "breach_alert_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"breach_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"recipients" text[] NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "breach_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"breach_id" uuid NOT NULL,
	"user_id" uuid,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "breaches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "breach_kind" NOT NULL,
	"role" "registration_role" DEFAULT 'controller' NOT NULL,
	"description" text NOT NULL,
	"occurred_at" timestamp with time zone,
	"discovered_at" timestamp with time zone NOT NULL,
	"data_subjects" text DEFAULT '' NOT NULL,
	"approx_subjects" integer,
	"data_categories" text DEFAULT '' NOT NULL,
	"sensitive_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"data_unintelligible" boolean DEFAULT false NOT NULL,
	"risk" "breach_risk" DEFAULT 'unassessed' NOT NULL,
	"risk_notes" text DEFAULT '' NOT NULL,
	"measures" text DEFAULT '' NOT NULL,
	"subject_advice" text DEFAULT '' NOT NULL,
	"unauthorised_party" text DEFAULT '' NOT NULL,
	"contact_person" text DEFAULT '' NOT NULL,
	"notified_at" timestamp with time zone,
	"notification_ref" text DEFAULT '' NOT NULL,
	"delay_reason" text DEFAULT '' NOT NULL,
	"subjects_notified_at" timestamp with time zone,
	"subjects_notified_how" text DEFAULT '' NOT NULL,
	"closed_at" timestamp with time zone,
	"lessons" text DEFAULT '' NOT NULL,
	"reported_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "breach_activities" ADD CONSTRAINT "breach_activities_breach_id_breaches_id_fk" FOREIGN KEY ("breach_id") REFERENCES "public"."breaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breach_activities" ADD CONSTRAINT "breach_activities_activity_id_processing_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."processing_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breach_alert_log" ADD CONSTRAINT "breach_alert_log_breach_id_breaches_id_fk" FOREIGN KEY ("breach_id") REFERENCES "public"."breaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breach_updates" ADD CONSTRAINT "breach_updates_breach_id_breaches_id_fk" FOREIGN KEY ("breach_id") REFERENCES "public"."breaches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breach_updates" ADD CONSTRAINT "breach_updates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaches" ADD CONSTRAINT "breaches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breaches" ADD CONSTRAINT "breaches_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "breach_alert_log_unique_idx" ON "breach_alert_log" USING btree ("breach_id","kind");--> statement-breakpoint
CREATE INDEX "breach_updates_breach_idx" ON "breach_updates" USING btree ("breach_id","created_at");--> statement-breakpoint
CREATE INDEX "breaches_org_idx" ON "breaches" USING btree ("org_id");