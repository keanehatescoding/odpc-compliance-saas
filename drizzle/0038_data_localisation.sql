CREATE TYPE "public"."kenya_data_purpose" AS ENUM('civil_registration', 'elections', 'public_finance', 'protected_system', 'basic_education', 'health_care');--> statement-breakpoint
CREATE TYPE "public"."kenya_hosting" AS ENUM('in_kenya', 'serving_copy');--> statement-breakpoint
ALTER TABLE "processing_activities" ADD COLUMN "kenya_data_purpose" "kenya_data_purpose";--> statement-breakpoint
ALTER TABLE "processing_activities" ADD COLUMN "kenya_hosting" "kenya_hosting";--> statement-breakpoint
ALTER TABLE "processing_activities" ADD COLUMN "kenya_data_centre" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_data_localisation_check" CHECK ("processing_activities"."kenya_data_purpose" is not null or ("processing_activities"."kenya_hosting" is null and "processing_activities"."kenya_data_centre" = ''));