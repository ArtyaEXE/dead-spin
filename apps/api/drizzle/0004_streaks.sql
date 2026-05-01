CREATE TABLE IF NOT EXISTS "group_streaks" (
	"chat_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"streak_days" integer DEFAULT 1 NOT NULL,
	"longest_streak" integer DEFAULT 1 NOT NULL,
	"last_play_date" text NOT NULL,
	"last_notified_milestone" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_streaks_chat_id_user_id_pk" PRIMARY KEY("chat_id","user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_streaks" ADD CONSTRAINT "group_streaks_chat_id_group_chats_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."group_chats"("chat_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_streaks" ADD CONSTRAINT "group_streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
