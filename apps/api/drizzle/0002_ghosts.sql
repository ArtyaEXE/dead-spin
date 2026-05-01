CREATE TABLE IF NOT EXISTS "group_ghosts" (
	"chat_id" bigint NOT NULL,
	"level" integer NOT NULL,
	"user_id" text NOT NULL,
	"stars" integer NOT NULL,
	"time_ms" integer NOT NULL,
	"recording" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_ghosts_chat_id_level_pk" PRIMARY KEY("chat_id","level")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_ghosts" ADD CONSTRAINT "group_ghosts_chat_id_group_chats_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."group_chats"("chat_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_ghosts" ADD CONSTRAINT "group_ghosts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
