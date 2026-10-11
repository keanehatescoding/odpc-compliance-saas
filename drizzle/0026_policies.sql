CREATE TYPE "public"."policy_kind" AS ENUM('data_protection', 'retention', 'breach', 'requests', 'security', 'other');--> statement-breakpoint
ALTER TYPE "public"."activity_area" ADD VALUE 'policy' BEFORE 'team';--> statement-breakpoint
CREATE TABLE "policies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "policy_kind" NOT NULL,
	"version" text DEFAULT '' NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"approved_by" text DEFAULT '' NOT NULL,
	"approved_on" date,
	"review_on" date,
	"location" text DEFAULT '' NOT NULL,
	"communicated" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policies" ADD CONSTRAINT "policies_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "policies_org_idx" ON "policies" USING btree ("org_id");