CREATE TYPE "public"."knowledge_status" AS ENUM('quarantined', 'certified', 'rejected');--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'knowledge_quarantined';--> statement-breakpoint
ALTER TABLE "knowledge_docs" ADD COLUMN "status" "knowledge_status" DEFAULT 'quarantined' NOT NULL;--> statement-breakpoint
UPDATE "knowledge_docs" SET "status" = 'certified';--> statement-breakpoint
ALTER TABLE "knowledge_docs" ADD COLUMN "verified_by_license_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_docs" ADD COLUMN "verified_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "knowledge_docs" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "knowledge_docs" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "knowledge_docs" ADD CONSTRAINT "knowledge_docs_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;