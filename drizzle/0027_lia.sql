CREATE TYPE "public"."lia_outcome" AS ENUM('pending', 'justified', 'overridden');--> statement-breakpoint
ALTER TYPE "public"."activity_area" ADD VALUE 'lia' BEFORE 'team';--> statement-breakpoint
CREATE TABLE "interest_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"activity_id" uuid,
	"name" text NOT NULL,
	"interest" text DEFAULT '' NOT NULL,
	"necessity" text DEFAULT '' NOT NULL,
	"impact" text DEFAULT '' NOT NULL,
	"safeguards" text DEFAULT '' NOT NULL,
	"objection" text DEFAULT '' NOT NULL,
	"outcome" "lia_outcome" DEFAULT 'pending' NOT NULL,
	"decided_by" text DEFAULT '' NOT NULL,
	"decided_on" date,
	"review_on" date,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "interest_assessments" ADD CONSTRAINT "interest_assessments_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interest_assessments" ADD CONSTRAINT "interest_assessments_activity_id_processing_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."processing_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "interest_assessments_org_idx" ON "interest_assessments" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "interest_assessments_activity_idx" ON "interest_assessments" USING btree ("activity_id");