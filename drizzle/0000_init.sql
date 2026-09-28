CREATE TYPE "public"."lawful_basis" AS ENUM('consent', 'contract', 'legal_obligation', 'vital_interests', 'public_interest', 'official_authority', 'legitimate_interests', 'research');--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."org_size" AS ENUM('micro_small', 'medium', 'large');--> statement-breakpoint
CREATE TYPE "public"."registration_role" AS ENUM('controller', 'processor');--> statement-breakpoint
CREATE TYPE "public"."sector" AS ENUM('education', 'health', 'sacco', 'fintech', 'retail', 'hospitality', 'other');--> statement-breakpoint
CREATE TABLE "memberships" (
	"user_id" uuid NOT NULL,
	"org_id" uuid NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_user_id_org_id_pk" PRIMARY KEY("user_id","org_id")
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sector" "sector" NOT NULL,
	"size" "org_size" NOT NULL,
	"kra_pin" text,
	"reminder_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"purpose" text NOT NULL,
	"lawful_basis" "lawful_basis" NOT NULL,
	"data_subjects" text[] DEFAULT '{}'::text[] NOT NULL,
	"data_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"sensitive_categories" text[] DEFAULT '{}'::text[] NOT NULL,
	"recipients" text DEFAULT '' NOT NULL,
	"cross_border" boolean DEFAULT false NOT NULL,
	"transfer_countries" text DEFAULT '' NOT NULL,
	"transfer_safeguards" text DEFAULT '' NOT NULL,
	"retention_period" text NOT NULL,
	"security_measures" text DEFAULT '' NOT NULL,
	"systems" text DEFAULT '' NOT NULL,
	"owner" text DEFAULT '' NOT NULL,
	"large_scale" boolean DEFAULT false NOT NULL,
	"systematic_monitoring" boolean DEFAULT false NOT NULL,
	"involves_children" boolean DEFAULT false NOT NULL,
	"template_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"role" "registration_role" NOT NULL,
	"certificate_number" text,
	"applied_on" date,
	"issued_on" date,
	"expires_on" date,
	"notes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"registration_id" uuid NOT NULL,
	"expires_on" date NOT NULL,
	"threshold_days" integer NOT NULL,
	"recipients" text[] NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_activities" ADD CONSTRAINT "processing_activities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_log" ADD CONSTRAINT "reminder_log_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "memberships_org_idx" ON "memberships" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "processing_activities_org_idx" ON "processing_activities" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "registrations_org_role_idx" ON "registrations" USING btree ("org_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_log_unique_idx" ON "reminder_log" USING btree ("registration_id","expires_on","threshold_days");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_lower_idx" ON "users" USING btree (lower("email"));