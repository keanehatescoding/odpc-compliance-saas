CREATE TYPE "public"."transfer_basis" AS ENUM('pending', 'adequacy', 'safeguards', 'necessity', 'consent');--> statement-breakpoint
ALTER TYPE "public"."activity_area" ADD VALUE 'transfer' BEFORE 'team';--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"activity_id" uuid,
	"recipient" text NOT NULL,
	"countries" text DEFAULT '' NOT NULL,
	"data_sent" text DEFAULT '' NOT NULL,
	"basis" "transfer_basis" DEFAULT 'pending' NOT NULL,
	"basis_detail" text DEFAULT '' NOT NULL,
	"subject_consent" text DEFAULT '' NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"started_on" date,
	"review_on" date,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_activity_id_processing_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."processing_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfers_org_idx" ON "transfers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "transfers_activity_idx" ON "transfers" USING btree ("activity_id");