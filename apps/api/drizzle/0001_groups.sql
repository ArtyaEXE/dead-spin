CREATE TABLE IF NOT EXISTS "group_chats" (
	"chat_id" bigint PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"type" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_membership_cache" (
	"chat_id" bigint NOT NULL,
	"tg_id" text NOT NULL,
	"is_member" integer NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_membership_cache_chat_id_tg_id_pk" PRIMARY KEY("chat_id","tg_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "group_progress_levels" (
	"chat_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"level" integer NOT NULL,
	"stars" integer NOT NULL,
	"time_ms" integer NOT NULL,
	"fuel_spent" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_progress_levels_chat_id_user_id_level_pk" PRIMARY KEY("chat_id","user_id","level"),
	CONSTRAINT "group_progress_levels_stars_check" CHECK ("group_progress_levels"."stars" between 0 and 3)
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_progress_levels" ADD CONSTRAINT "group_progress_levels_chat_id_group_chats_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."group_chats"("chat_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_progress_levels" ADD CONSTRAINT "group_progress_levels_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_progress_levels_leaderboard_idx" ON "group_progress_levels" USING btree ("chat_id","level","stars","time_ms");