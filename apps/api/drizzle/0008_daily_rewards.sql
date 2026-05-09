CREATE TABLE IF NOT EXISTS "daily_rewards" (
	"user_id" text PRIMARY KEY NOT NULL,
	"streak_days" integer DEFAULT 1 NOT NULL,
	"longest_streak" integer DEFAULT 1 NOT NULL,
	"last_claim_date" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_rewards" ADD CONSTRAINT "daily_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
