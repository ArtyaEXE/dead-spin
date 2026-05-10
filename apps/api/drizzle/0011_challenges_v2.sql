ALTER TABLE "group_challenges" ALTER COLUMN "status" SET DEFAULT 'pending_accept';--> statement-breakpoint
ALTER TABLE "group_challenges" ADD COLUMN "challenger_recording" jsonb;--> statement-breakpoint
ALTER TABLE "group_challenges" ADD COLUMN "challengee_recording" jsonb;--> statement-breakpoint
ALTER TABLE "group_challenges" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_challenges_challenger_status_idx" ON "group_challenges" USING btree ("challenger_user_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_challenges_challengee_status_idx" ON "group_challenges" USING btree ("challengee_user_id","status");