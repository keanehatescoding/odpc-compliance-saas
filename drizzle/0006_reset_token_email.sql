-- Outstanding links don't record the address they went to, so they can't be
-- checked against it. They expire within the hour anyway; people can ask again.
DELETE FROM "password_reset_tokens";--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD COLUMN "email" text NOT NULL;
