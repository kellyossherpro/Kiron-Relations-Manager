CREATE TABLE "go_live_confirmations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"check_key" text NOT NULL,
	"team_id" uuid,
	"confirmed_by" uuid NOT NULL,
	"note" text,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "go_live_confirmations" ADD CONSTRAINT "go_live_confirmations_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_live_confirmations" ADD CONSTRAINT "go_live_confirmations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "go_live_confirmations" ADD CONSTRAINT "go_live_confirmations_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "go_live_one_per_check" ON "go_live_confirmations" USING btree ("deal_id","check_key");