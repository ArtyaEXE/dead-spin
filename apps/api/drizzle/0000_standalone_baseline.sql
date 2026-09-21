CREATE TABLE IF NOT EXISTS "achievements" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "achievements_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "daily_rewards" (
	"user_id" text PRIMARY KEY NOT NULL,
	"streak_days" integer DEFAULT 1 NOT NULL,
	"longest_streak" integer DEFAULT 1 NOT NULL,
	"last_claim_date" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "global_ghosts" (
	"level" integer PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stars" integer NOT NULL,
	"time_ms" integer NOT NULL,
	"recording" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "progress_levels" (
	"user_id" text NOT NULL,
	"level" integer NOT NULL,
	"stars" integer NOT NULL,
	"time_ms" integer NOT NULL,
	"fuel_spent" integer NOT NULL,
	"par_hit" boolean DEFAULT false NOT NULL,
	"full_clear" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "progress_levels_user_id_level_pk" PRIMARY KEY("user_id","level"),
	CONSTRAINT "progress_levels_stars_check" CHECK ("progress_levels"."stars" between 0 and 3)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "progresses" (
	"user_id" text PRIMARY KEY NOT NULL,
	"summary_stars" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"device_id" text NOT NULL,
	"username" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"details" integer DEFAULT 0 NOT NULL,
	"selected_skin" text DEFAULT 'prospector' NOT NULL,
	"seen_tutorials" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "achievements" ADD CONSTRAINT "achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "daily_rewards" ADD CONSTRAINT "daily_rewards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "global_ghosts" ADD CONSTRAINT "global_ghosts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "progress_levels" ADD CONSTRAINT "progress_levels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "progresses" ADD CONSTRAINT "progresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "progress_levels_leaderboard_idx" ON "progress_levels" USING btree ("level","stars","time_ms");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_device_id_idx" ON "users" USING btree ("device_id");