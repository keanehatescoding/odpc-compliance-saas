ALTER TABLE "billing_alert_log" ALTER COLUMN "sent_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "billing_alert_log" ALTER COLUMN "sent_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "breach_alert_log" ALTER COLUMN "sent_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "breach_alert_log" ALTER COLUMN "sent_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "complaint_alert_log" ALTER COLUMN "sent_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "complaint_alert_log" ALTER COLUMN "sent_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "particular_change_alert_log" ALTER COLUMN "sent_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "particular_change_alert_log" ALTER COLUMN "sent_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_log" ALTER COLUMN "sent_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "reminder_log" ALTER COLUMN "sent_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "subject_request_alert_log" ALTER COLUMN "sent_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "subject_request_alert_log" ALTER COLUMN "sent_at" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_alert_log" ADD COLUMN "claimed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "breach_alert_log" ADD COLUMN "claimed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "complaint_alert_log" ADD COLUMN "claimed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "particular_change_alert_log" ADD COLUMN "claimed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_log" ADD COLUMN "claimed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "subject_request_alert_log" ADD COLUMN "claimed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Rows from before this kept sent_at, so they count as sent. Each was claimed when it was sent.
UPDATE "billing_alert_log" SET "claimed_at" = "sent_at";--> statement-breakpoint
UPDATE "breach_alert_log" SET "claimed_at" = "sent_at";--> statement-breakpoint
UPDATE "complaint_alert_log" SET "claimed_at" = "sent_at";--> statement-breakpoint
UPDATE "particular_change_alert_log" SET "claimed_at" = "sent_at";--> statement-breakpoint
UPDATE "reminder_log" SET "claimed_at" = "sent_at";--> statement-breakpoint
UPDATE "subject_request_alert_log" SET "claimed_at" = "sent_at";
