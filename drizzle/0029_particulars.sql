ALTER TYPE "public"."activity_area" ADD VALUE 'particulars' BEFORE 'ropa';--> statement-breakpoint
CREATE TABLE "particular_change_alert_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"change_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"recipients" text[] NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "particular_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"role" "registration_role",
	"changed_on" date NOT NULL,
	"description" text NOT NULL,
	"notified_on" date,
	"notified_how" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"logged_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "particular_change_alert_log" ADD CONSTRAINT "particular_change_alert_log_change_id_particular_changes_id_fk" FOREIGN KEY ("change_id") REFERENCES "public"."particular_changes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "particular_changes" ADD CONSTRAINT "particular_changes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "particular_changes" ADD CONSTRAINT "particular_changes_logged_by_users_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "particular_change_alert_log_unique_idx" ON "particular_change_alert_log" USING btree ("change_id","kind");--> statement-breakpoint
CREATE INDEX "particular_changes_org_idx" ON "particular_changes" USING btree ("org_id","changed_on");