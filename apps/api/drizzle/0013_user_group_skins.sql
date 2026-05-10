CREATE TABLE IF NOT EXISTS "user_group_skins" (
	"user_id" text NOT NULL,
	"chat_id" bigint NOT NULL,
	"selected_skin" text DEFAULT 'prospector' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_group_skins_user_id_chat_id_pk" PRIMARY KEY("user_id","chat_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_group_skins" ADD CONSTRAINT "user_group_skins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_group_skins" ADD CONSTRAINT "user_group_skins_chat_id_group_chats_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."group_chats"("chat_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
