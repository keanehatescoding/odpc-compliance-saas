CREATE TYPE "public"."complaint_kind" AS ENUM('complaint', 'enforcement_notice', 'penalty_notice', 'information');--> statement-breakpoint
ALTER TYPE "public"."activity_area" ADD VALUE 'complaint' BEFORE 'processor';--> statement-breakpoint
CREATE TABLE "complaint_alert_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"complaint_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"recipients" text[] NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "complaints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "complaint_kind" NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"received_on" date NOT NULL,
	"due_on" date NOT NULL,
	"complainant" text DEFAULT '' NOT NULL,
	"summary" text NOT NULL,
	"handled_by" text DEFAULT '' NOT NULL,
	"responded_on" date,
	"response" text DEFAULT '' NOT NULL,
	"closed_on" date,
	"outcome" text DEFAULT '' NOT NULL,
	"logged_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "complaint_alert_log" ADD CONSTRAINT "complaint_alert_log_complaint_id_complaints_id_fk" FOREIGN KEY ("complaint_id") REFERENCES "public"."complaints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "complaints" ADD CONSTRAINT "complaints_logged_by_users_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "complaint_alert_log_unique_idx" ON "complaint_alert_log" USING btree ("complaint_id","kind");--> statement-breakpoint
CREATE INDEX "complaints_org_idx" ON "complaints" USING btree ("org_id","received_on");