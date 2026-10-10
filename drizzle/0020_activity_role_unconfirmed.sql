ALTER TABLE "processing_activities" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "processing_activities" ALTER COLUMN "role" DROP NOT NULL;--> statement-breakpoint
-- 0019 marked every existing activity as controller without anyone saying so. The sector templates
-- describe the organisation's own processing; the rest wait for someone to confirm the role.
UPDATE "processing_activities" SET "role" = NULL WHERE "template_id" IS NULL;
