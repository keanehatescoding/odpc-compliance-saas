CREATE TABLE "renewal_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"attempt" integer NOT NULL,
	"payment_id" uuid,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"authorization_code" text NOT NULL,
	"email" text NOT NULL,
	"brand" text,
	"last4" text,
	"exp_month" integer,
	"exp_year" integer,
	"saved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "auto_renew_interval" "billing_interval";--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "save_card" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "renewal_attempts" ADD CONSTRAINT "renewal_attempts_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "renewal_attempts" ADD CONSTRAINT "renewal_attempts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_cards" ADD CONSTRAINT "saved_cards_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_cards" ADD CONSTRAINT "saved_cards_saved_by_users_id_fk" FOREIGN KEY ("saved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "renewal_attempts_unique_idx" ON "renewal_attempts" USING btree ("org_id","ends_at","attempt");--> statement-breakpoint
CREATE UNIQUE INDEX "saved_cards_org_idx" ON "saved_cards" USING btree ("org_id");