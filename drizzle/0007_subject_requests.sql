CREATE TYPE "public"."subject_request_kind" AS ENUM('access', 'rectification', 'erasure', 'restriction', 'objection', 'portability', 'marketing');--> statement-breakpoint
CREATE TYPE "public"."subject_request_outcome" AS ENUM('completed', 'declined');--> statement-breakpoint
CREATE TABLE "subject_request_alert_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"recipients" text[] NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subject_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "subject_request_kind" NOT NULL,
	"received_on" date NOT NULL,
	"requester_name" text NOT NULL,
	"requester_contact" text DEFAULT '' NOT NULL,
	"representative" text DEFAULT '' NOT NULL,
	"channel" text DEFAULT '' NOT NULL,
	"details" text NOT NULL,
	"identity_check" text DEFAULT '' NOT NULL,
	"outcome" "subject_request_outcome",
	"responded_on" date,
	"response" text DEFAULT '' NOT NULL,
	"logged_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "subject_request_alert_log" ADD CONSTRAINT "subject_request_alert_log_request_id_subject_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."subject_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_requests" ADD CONSTRAINT "subject_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subject_requests" ADD CONSTRAINT "subject_requests_logged_by_users_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subject_request_alert_log_unique_idx" ON "subject_request_alert_log" USING btree ("request_id","kind");--> statement-breakpoint
CREATE INDEX "subject_requests_org_idx" ON "subject_requests" USING btree ("org_id","received_on");