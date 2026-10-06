CREATE TYPE "public"."activity_area" AS ENUM('registration', 'ropa', 'dpia', 'breach', 'request', 'team', 'organization', 'billing');--> statement-breakpoint
CREATE TABLE "activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"actor_id" uuid,
	"actor_name" text NOT NULL,
	"area" "activity_area" NOT NULL,
	"subject_id" uuid,
	"summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_log" ADD CONSTRAINT "activity_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_log_org_idx" ON "activity_log" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "activity_log_subject_idx" ON "activity_log" USING btree ("subject_id","created_at");