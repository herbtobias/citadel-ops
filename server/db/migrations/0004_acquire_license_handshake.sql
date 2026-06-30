CREATE TYPE "public"."license_kind" AS ENUM('standing', 'provisioning', 'session');--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "kind" "license_kind" DEFAULT 'standing' NOT NULL;--> statement-breakpoint
ALTER TABLE "licenses" ADD COLUMN "parent_license_id" uuid;--> statement-breakpoint
ALTER TABLE "licenses" ADD CONSTRAINT "licenses_parent_license_id_licenses_id_fk" FOREIGN KEY ("parent_license_id") REFERENCES "public"."licenses"("id") ON DELETE cascade ON UPDATE no action;