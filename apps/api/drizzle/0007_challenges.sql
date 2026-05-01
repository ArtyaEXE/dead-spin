CREATE TABLE IF NOT EXISTS "group_challenges" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"chat_id" bigint NOT NULL,
	"level" integer NOT NULL,
	"challenger_user_id" text NOT NULL,
	"challengee_user_id" text NOT NULL,
	"challenger_stars" integer,
	"challenger_time_ms" integer,
	"challengee_stars" integer,
	"challengee_time_ms" integer,
	"message_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_challenges" ADD CONSTRAINT "group_challenges_chat_id_group_chats_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."group_chats"("chat_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_challenges" ADD CONSTRAINT "group_challenges_challenger_user_id_users_id_fk" FOREIGN KEY ("challenger_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "group_challenges" ADD CONSTRAINT "group_challenges_challengee_user_id_users_id_fk" FOREIGN KEY ("challengee_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "group_challenges_pending_idx" ON "group_challenges" USING btree ("chat_id","level","status");