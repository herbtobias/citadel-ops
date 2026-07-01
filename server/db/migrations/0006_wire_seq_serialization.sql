ALTER TABLE "activity_log" ADD COLUMN "seq" bigserial NOT NULL;--> statement-breakpoint
CREATE INDEX "activity_project_seq_idx" ON "activity_log" USING btree ("project_id","seq");