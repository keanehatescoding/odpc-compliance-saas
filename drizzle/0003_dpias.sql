CREATE TYPE "public"."risk_likelihood" AS ENUM('remote', 'possible', 'probable');--> statement-breakpoint
CREATE TYPE "public"."risk_severity" AS ENUM('minimal', 'significant', 'severe');--> statement-breakpoint
CREATE TABLE "dpia_risks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dpia_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"description" text NOT NULL,
	"likelihood" "risk_likelihood" NOT NULL,
	"severity" "risk_severity" NOT NULL,
	"mitigation" text DEFAULT '' NOT NULL,
	"residual_likelihood" "risk_likelihood" NOT NULL,
	"residual_severity" "risk_severity" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dpias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"activity_id" uuid,
	"title" text NOT NULL,
	"template_id" text,
	"description" text DEFAULT '' NOT NULL,
	"purposes" text DEFAULT '' NOT NULL,
	"necessity" text DEFAULT '' NOT NULL,
	"consultation" text DEFAULT '' NOT NULL,
	"conclusion" text DEFAULT '' NOT NULL,
	"assessor" text DEFAULT '' NOT NULL,
	"approved_by" text DEFAULT '' NOT NULL,
	"approved_on" date,
	"review_on" date,
	"odpc_consulted_on" date,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dpia_risks" ADD CONSTRAINT "dpia_risks_dpia_id_dpias_id_fk" FOREIGN KEY ("dpia_id") REFERENCES "public"."dpias"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpias" ADD CONSTRAINT "dpias_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpias" ADD CONSTRAINT "dpias_activity_id_processing_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."processing_activities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dpias" ADD CONSTRAINT "dpias_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dpia_risks_dpia_idx" ON "dpia_risks" USING btree ("dpia_id","position");--> statement-breakpoint
CREATE INDEX "dpias_org_idx" ON "dpias" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dpias_activity_idx" ON "dpias" USING btree ("activity_id");