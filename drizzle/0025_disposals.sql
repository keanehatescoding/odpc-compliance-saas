CREATE TYPE "public"."disposal_method" AS ENUM('deleted', 'shredded', 'anonymised', 'returned', 'other');--> statement-breakpoint
CREATE TYPE "public"."disposal_reason" AS ENUM('retention', 'erasure', 'consent_withdrawn', 'purpose_ended', 'other');--> statement-breakpoint
ALTER TYPE "public"."activity_area" ADD VALUE 'disposal' BEFORE 'team';--> statement-breakpoint
CREATE TABLE "disposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"activity_id" uuid,
	"description" text NOT NULL,
	"disposed_on" date NOT NULL,
	"method" "disposal_method" NOT NULL,
	"reason" "disposal_reason" NOT NULL,
	"record_count" integer,
	"authorised_by" text DEFAULT '' NOT NULL,
	"carried_out_by" text DEFAULT '' NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"next_on" date,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "disposals_record_count_positive" CHECK ("disposals"."record_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disposals" ADD CONSTRAINT "disposals_activity_id_processing_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."processing_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disposals_org_idx" ON "disposals" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "disposals_activity_idx" ON "disposals" USING btree ("activity_id");