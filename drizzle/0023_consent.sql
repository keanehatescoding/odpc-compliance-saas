CREATE TYPE "public"."consent_method" AS ENUM('written', 'online', 'sms', 'verbal', 'other');--> statement-breakpoint
ALTER TYPE "public"."activity_area" ADD VALUE 'consent' BEFORE 'team';--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"activity_id" uuid,
	"name" text NOT NULL,
	"wording" text DEFAULT '' NOT NULL,
	"method" "consent_method" NOT NULL,
	"collection" text DEFAULT '' NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"withdrawal" text DEFAULT '' NOT NULL,
	"parental" boolean DEFAULT false NOT NULL,
	"guardian_check" text DEFAULT '' NOT NULL,
	"conditional" boolean DEFAULT false NOT NULL,
	"in_use_from" date,
	"review_on" date,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_activity_id_processing_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."processing_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_records_org_idx" ON "consent_records" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "consent_records_activity_idx" ON "consent_records" USING btree ("activity_id");