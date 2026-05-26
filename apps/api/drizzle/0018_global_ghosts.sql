CREATE TABLE IF NOT EXISTS "global_ghosts" (
	"level" integer PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"stars" integer NOT NULL,
	"time_ms" integer NOT NULL,
	"recording" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "global_ghosts" ADD CONSTRAINT "global_ghosts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
