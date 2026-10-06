CREATE TYPE "public"."payment_kind" AS ENUM('subscription', 'service');--> statement-breakpoint
CREATE TYPE "public"."service" AS ENUM('dpia_review', 'compliance_audit');--> statement-breakpoint
CREATE TYPE "public"."service_order_status" AS ENUM('awaiting_payment', 'paid', 'in_progress', 'delivered', 'cancelled');--> statement-breakpoint
CREATE TABLE "service_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"payment_id" uuid NOT NULL,
	"status" "service_order_status" DEFAULT 'awaiting_payment' NOT NULL,
	"notes" text,
	"requested_by" uuid,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "interval" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "kind" "payment_kind" DEFAULT 'subscription' NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "service" "service";--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_orders_payment_idx" ON "service_orders" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "service_orders_org_idx" ON "service_orders" USING btree ("org_id","created_at");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_interval_check" CHECK (("payments"."kind" = 'subscription') = ("payments"."interval" is not null));--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_service_check" CHECK (("payments"."kind" = 'service') = ("payments"."service" is not null));