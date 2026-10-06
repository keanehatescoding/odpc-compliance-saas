CREATE TYPE "public"."etims_invoice_status" AS ENUM('pending', 'signed', 'failed');--> statement-breakpoint
CREATE SEQUENCE "public"."etims_invoice_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "etims_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"invc_no" integer DEFAULT nextval('etims_invoice_seq') NOT NULL,
	"status" "etims_invoice_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"tin" text,
	"bhf_id" text,
	"sdc_id" text,
	"rcpt_no" integer,
	"tot_rcpt_no" integer,
	"intrl_data" text,
	"rcpt_sign" text,
	"sdc_date_time" timestamp with time zone,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "etims_invoices" ADD CONSTRAINT "etims_invoices_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "etims_invoices_payment_idx" ON "etims_invoices" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "etims_invoices_invc_no_idx" ON "etims_invoices" USING btree ("invc_no");--> statement-breakpoint
CREATE INDEX "etims_invoices_due_idx" ON "etims_invoices" USING btree ("next_attempt_at") WHERE "etims_invoices"."status" = 'pending';