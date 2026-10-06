CREATE TABLE "refunds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"paystack_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text NOT NULL,
	"refunded_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "etims_invoices_payment_idx";--> statement-breakpoint
ALTER TABLE "etims_invoices" ADD COLUMN "refund_id" uuid;--> statement-breakpoint
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "refunds_paystack_idx" ON "refunds" USING btree ("paystack_id");--> statement-breakpoint
CREATE INDEX "refunds_payment_idx" ON "refunds" USING btree ("payment_id");--> statement-breakpoint
ALTER TABLE "etims_invoices" ADD CONSTRAINT "etims_invoices_refund_id_refunds_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refunds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "etims_invoices_refund_idx" ON "etims_invoices" USING btree ("refund_id");--> statement-breakpoint
CREATE UNIQUE INDEX "etims_invoices_payment_idx" ON "etims_invoices" USING btree ("payment_id") WHERE "etims_invoices"."refund_id" is null;