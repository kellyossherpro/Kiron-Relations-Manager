CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"deal_id" uuid,
	"stage_key" text,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stage_requirements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"stage_key" text NOT NULL,
	"kind" text NOT NULL,
	"field_key" text,
	"contact_role" text,
	"when_field" text,
	"when_value" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stage_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_stage" text NOT NULL,
	"to_stage" text NOT NULL,
	"when_field" text,
	"when_value" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_requirements" ADD CONSTRAINT "stage_requirements_stage_key_pipeline_stages_key_fk" FOREIGN KEY ("stage_key") REFERENCES "public"."pipeline_stages"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_from_stage_pipeline_stages_key_fk" FOREIGN KEY ("from_stage") REFERENCES "public"."pipeline_stages"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stage_transitions" ADD CONSTRAINT "stage_transitions_to_stage_pipeline_stages_key_fk" FOREIGN KEY ("to_stage") REFERENCES "public"."pipeline_stages"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_deal_idx" ON "notifications" USING btree ("deal_id","kind");--> statement-breakpoint
CREATE INDEX "stage_requirements_stage_idx" ON "stage_requirements" USING btree ("stage_key");--> statement-breakpoint
CREATE INDEX "stage_transitions_from_idx" ON "stage_transitions" USING btree ("from_stage");