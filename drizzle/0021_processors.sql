ALTER TYPE "public"."activity_area" ADD VALUE 'processor' BEFORE 'team';--> statement-breakpoint
CREATE TABLE "processor_activities" (
	"processor_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	CONSTRAINT "processor_activities_processor_id_activity_id_pk" PRIMARY KEY("processor_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE "processors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"service" text NOT NULL,
	"contact" text DEFAULT '' NOT NULL,
	"location" text DEFAULT '' NOT NULL,
	"outside_kenya" boolean DEFAULT false NOT NULL,
	"guarantees" text DEFAULT '' NOT NULL,
	"contract_signed_on" date,
	"contract_ref" text DEFAULT '' NOT NULL,
	"contract_review_on" date,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "processor_activities" ADD CONSTRAINT "processor_activities_processor_id_processors_id_fk" FOREIGN KEY ("processor_id") REFERENCES "public"."processors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processor_activities" ADD CONSTRAINT "processor_activities_activity_id_processing_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."processing_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processors" ADD CONSTRAINT "processors_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "processor_activities_activity_idx" ON "processor_activities" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "processors_org_idx" ON "processors" USING btree ("org_id");