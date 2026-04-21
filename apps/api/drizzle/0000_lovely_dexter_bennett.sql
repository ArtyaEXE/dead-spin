CREATE TABLE IF NOT EXISTS "allowlist" (
	"tg_id" text PRIMARY KEY NOT NULL,
	"note" text DEFAULT '',
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "editor_admins" (
	"tg_id" text PRIMARY KEY NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payments" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
	"tg_charge_id" text NOT NULL,
	"user_id" text NOT NULL,
	"lot_id" text NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'XTR' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "progress_levels" (
	"user_id" text NOT NULL,
	"level" integer NOT NULL,
	"stars" integer NOT NULL,
	"time_ms" integer NOT NULL,
	"fuel_spent" integer NOT NULL,
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
	"tg_id" text NOT NULL,
	"username" text NOT NULL,
	"locale" text DEFAULT 'en' NOT NULL,
	"fuel" integer DEFAULT 10000 NOT NULL,
	"fuel_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"coins" integer DEFAULT 0 NOT NULL,
	"details" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "editor_admins" ADD CONSTRAINT "editor_admins_tg_id_allowlist_tg_id_fk" FOREIGN KEY ("tg_id") REFERENCES "public"."allowlist"("tg_id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
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
CREATE UNIQUE INDEX IF NOT EXISTS "payments_tg_charge_id_idx" ON "payments" USING btree ("tg_charge_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "progress_levels_leaderboard_idx" ON "progress_levels" USING btree ("level","stars","time_ms");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_tg_id_idx" ON "users" USING btree ("tg_id");