CREATE TYPE "public"."q_branch_status" AS ENUM('pending', 'active', 'inactive');--> statement-breakpoint
ALTER TABLE "design_guidelines" ADD COLUMN "status" "q_branch_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "design_guidelines" ADD COLUMN "created_by_license_id" uuid;--> statement-breakpoint
ALTER TABLE "design_guidelines" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "harness_defs" ADD COLUMN "status" "q_branch_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "harness_defs" ADD COLUMN "created_by_license_id" uuid;--> statement-breakpoint
ALTER TABLE "harness_defs" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "quality_gates" ADD COLUMN "status" "q_branch_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "quality_gates" ADD COLUMN "created_by_license_id" uuid;--> statement-breakpoint
ALTER TABLE "quality_gates" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;