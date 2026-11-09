ALTER TABLE "organizations" ADD COLUMN "dpo_designated" boolean;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "dpo_name" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "dpo_email" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "dpo_phone" text;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "dpo_appointed_on" date;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "dpo_notified_on" date;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "dpo_details_changed_on" date;