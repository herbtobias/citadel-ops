ALTER TYPE "public"."mission_status" ADD VALUE 'waiting_human' BEFORE 'done';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'human_input_requested';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'human_input_answered';