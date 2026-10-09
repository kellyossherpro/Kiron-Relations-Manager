CREATE TABLE "addendums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deal_id" uuid NOT NULL,
	"type" text NOT NULL,
	"details" text NOT NULL,
	"from_stage" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"raised_by" uuid,
	"raised_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" uuid,
	"closed_at" timestamp with time zone,
	"close_note" text
);
--> statement-breakpoint
ALTER TABLE "addendums" ADD CONSTRAINT "addendums_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addendums" ADD CONSTRAINT "addendums_from_stage_pipeline_stages_key_fk" FOREIGN KEY ("from_stage") REFERENCES "public"."pipeline_stages"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addendums" ADD CONSTRAINT "addendums_raised_by_users_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "addendums" ADD CONSTRAINT "addendums_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "addendums_deal_idx" ON "addendums" USING btree ("deal_id","raised_at");--> statement-breakpoint
CREATE UNIQUE INDEX "addendums_one_open" ON "addendums" USING btree ("deal_id") WHERE "addendums"."status" = 'open';