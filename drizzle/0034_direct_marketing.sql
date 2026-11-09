CREATE TYPE "public"."marketing_ground" AS ENUM('consent', 'law');--> statement-breakpoint
ALTER TABLE "processing_activities" ADD COLUMN "direct_marketing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD COLUMN "marketing_ground" "marketing_ground";--> statement-breakpoint
ALTER TABLE "processing_activities" ADD COLUMN "marketing_channels" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD COLUMN "marketing_opt_out" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD COLUMN "marketing_opt_out_records" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_direct_marketing_check" CHECK ("processing_activities"."direct_marketing" or ("processing_activities"."marketing_ground" is null and "processing_activities"."marketing_channels" = '' and "processing_activities"."marketing_opt_out" = '' and "processing_activities"."marketing_opt_out_records" = ''));