ALTER TYPE "public"."activity_area" ADD VALUE 'training' BEFORE 'team';--> statement-breakpoint
CREATE TABLE "training_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"title" text NOT NULL,
	"held_on" date NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"audience" text NOT NULL,
	"attendee_count" integer,
	"topics" text NOT NULL,
	"evidence" text DEFAULT '' NOT NULL,
	"refresher_on" date,
	"refreshes_id" uuid,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "training_sessions_attendee_count_positive" CHECK ("training_sessions"."attendee_count" > 0)
);
--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_sessions" ADD CONSTRAINT "training_sessions_refreshes_id_training_sessions_id_fk" FOREIGN KEY ("refreshes_id") REFERENCES "public"."training_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_sessions_org_idx" ON "training_sessions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "training_sessions_refreshes_idx" ON "training_sessions" USING btree ("refreshes_id");