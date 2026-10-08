CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"object_type" text NOT NULL,
	"file_name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"finished_at" timestamp with time zone,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "hubspot_id" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "hubspot_id" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "hubspot_id" text;--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "companies_hubspot_unique" ON "companies" USING btree ("hubspot_id") WHERE "companies"."deleted_at" is null and "companies"."hubspot_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_hubspot_unique" ON "contacts" USING btree ("hubspot_id") WHERE "contacts"."deleted_at" is null and "contacts"."hubspot_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "deals_hubspot_unique" ON "deals" USING btree ("hubspot_id") WHERE "deals"."deleted_at" is null and "deals"."hubspot_id" is not null;