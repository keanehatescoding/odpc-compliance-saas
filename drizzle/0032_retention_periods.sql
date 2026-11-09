CREATE TYPE "public"."retention_unit" AS ENUM('days', 'months', 'years');--> statement-breakpoint
ALTER TABLE "processing_activities" ADD COLUMN "retention_length" integer;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD COLUMN "retention_unit" "retention_unit";--> statement-breakpoint
ALTER TABLE "processing_activities" ADD COLUMN "retention_from" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_retention_check" CHECK (("processing_activities"."retention_length" is null) = ("processing_activities"."retention_unit" is null));--> statement-breakpoint
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_retention_length_positive" CHECK ("processing_activities"."retention_length" > 0);