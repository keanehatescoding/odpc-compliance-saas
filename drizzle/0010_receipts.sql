CREATE SEQUENCE "public"."receipt_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "receipt_number" integer;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "billed_name" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "billed_kra_pin" text;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_receipt_number_idx" ON "payments" USING btree ("receipt_number");--> statement-breakpoint
-- Number payments credited before receipts existed in the order they were paid, billed to the organisation as it is now.
UPDATE "payments" SET "receipt_number" = n."rn", "billed_name" = o."name", "billed_kra_pin" = o."kra_pin"
FROM (SELECT "id", row_number() OVER (ORDER BY "paid_at", "created_at", "id") AS "rn" FROM "payments" WHERE "status" = 'succeeded') n, "organizations" o
WHERE "payments"."id" = n."id" AND o."id" = "payments"."org_id";--> statement-breakpoint
SELECT setval('"public"."receipt_number_seq"', max("receipt_number")) FROM "payments" WHERE "receipt_number" IS NOT NULL;
