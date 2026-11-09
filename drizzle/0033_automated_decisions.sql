CREATE TYPE "public"."automated_decision_ground" AS ENUM('contract', 'law', 'consent');--> statement-breakpoint
ALTER TABLE "processing_activities" ADD COLUMN "automated_decisions" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD COLUMN "automated_decision_ground" "automated_decision_ground";--> statement-breakpoint
ALTER TABLE "processing_activities" ADD COLUMN "automated_decision_logic" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD COLUMN "automated_decision_review" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD COLUMN "automated_decision_checks" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_automated_decision_check" CHECK ("processing_activities"."automated_decisions" or ("processing_activities"."automated_decision_ground" is null and "processing_activities"."automated_decision_logic" = '' and "processing_activities"."automated_decision_review" = '' and "processing_activities"."automated_decision_checks" = ''));