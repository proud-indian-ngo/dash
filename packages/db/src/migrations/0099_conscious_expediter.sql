CREATE TYPE "public"."kalakriti_inventory_type" AS ENUM('initial_inventory', 'purchase', 'dispatch', 'return', 'adjustment');--> statement-breakpoint
CREATE TABLE "kalakriti_inventory_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"edition_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_paise" integer DEFAULT 0 NOT NULL,
	"photo_key" text,
	"photo_name" text,
	"photo_mime_type" text,
	"photo_size" integer,
	"archived_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "kalakriti_inventory_item_photo_key_unique" UNIQUE("photo_key"),
	CONSTRAINT "kalakriti_inventory_item_edition_id_uq" UNIQUE("edition_id","id"),
	CONSTRAINT "kalakriti_inventory_item_quantity_chk" CHECK ("kalakriti_inventory_item"."quantity" >= 0),
	CONSTRAINT "kalakriti_inventory_item_price_chk" CHECK ("kalakriti_inventory_item"."unit_price_paise" >= 0),
	CONSTRAINT "kalakriti_inventory_item_name_chk" CHECK (length(trim("kalakriti_inventory_item"."name")) BETWEEN 1 AND 120),
	CONSTRAINT "kalakriti_inventory_item_archived_chk" CHECK ("kalakriti_inventory_item"."archived_at" IS NULL OR "kalakriti_inventory_item"."quantity" = 0),
	CONSTRAINT "kalakriti_inventory_item_photo_chk" CHECK (("kalakriti_inventory_item"."photo_key" IS NULL AND "kalakriti_inventory_item"."photo_name" IS NULL AND "kalakriti_inventory_item"."photo_mime_type" IS NULL AND "kalakriti_inventory_item"."photo_size" IS NULL) OR ("kalakriti_inventory_item"."photo_key" IS NOT NULL AND "kalakriti_inventory_item"."photo_name" IS NOT NULL AND "kalakriti_inventory_item"."photo_mime_type" IS NOT NULL AND "kalakriti_inventory_item"."photo_size" IS NOT NULL AND "kalakriti_inventory_item"."photo_size" > 0 AND "kalakriti_inventory_item"."photo_size" <= 5242880))
);
--> statement-breakpoint
CREATE TABLE "kalakriti_inventory_transaction" (
	"id" uuid PRIMARY KEY NOT NULL,
	"edition_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"type" "kalakriti_inventory_type" NOT NULL,
	"quantity" integer NOT NULL,
	"quantity_before" integer NOT NULL,
	"quantity_after" integer NOT NULL,
	"volunteer_membership_id" uuid,
	"competition_id" uuid,
	"notes" text,
	"actor_user_id" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "kalakriti_inventory_tx_balances_chk" CHECK ("kalakriti_inventory_transaction"."quantity_before" >= 0 AND "kalakriti_inventory_transaction"."quantity_after" >= 0 AND "kalakriti_inventory_transaction"."quantity_after"::bigint = "kalakriti_inventory_transaction"."quantity_before"::bigint + "kalakriti_inventory_transaction"."quantity"::bigint),
	CONSTRAINT "kalakriti_inventory_tx_type_chk" CHECK (("kalakriti_inventory_transaction"."type" = 'initial_inventory' AND "kalakriti_inventory_transaction"."quantity_before" = 0 AND "kalakriti_inventory_transaction"."quantity" >= 0) OR ("kalakriti_inventory_transaction"."type" IN ('purchase', 'return') AND "kalakriti_inventory_transaction"."quantity" > 0) OR ("kalakriti_inventory_transaction"."type" = 'dispatch' AND "kalakriti_inventory_transaction"."quantity" < 0) OR ("kalakriti_inventory_transaction"."type" = 'adjustment' AND "kalakriti_inventory_transaction"."notes" IS NOT NULL AND length(trim("kalakriti_inventory_transaction"."notes")) > 0)),
	CONSTRAINT "kalakriti_inventory_tx_volunteer_chk" CHECK ("kalakriti_inventory_transaction"."type" NOT IN ('dispatch', 'return') OR "kalakriti_inventory_transaction"."volunteer_membership_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "kalakriti_inventory_item" ADD CONSTRAINT "kalakriti_inventory_item_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_inventory_transaction" ADD CONSTRAINT "kalakriti_inventory_transaction_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_inventory_transaction" ADD CONSTRAINT "kalakriti_inventory_transaction_edition_id_item_id_kalakriti_inventory_item_edition_id_id_fk" FOREIGN KEY ("edition_id","item_id") REFERENCES "public"."kalakriti_inventory_item"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_inventory_transaction" ADD CONSTRAINT "kalakriti_inventory_transaction_edition_id_volunteer_membership_id_kalakriti_edition_membership_edition_id_id_fk" FOREIGN KEY ("edition_id","volunteer_membership_id") REFERENCES "public"."kalakriti_edition_membership"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_inventory_transaction" ADD CONSTRAINT "kalakriti_inventory_transaction_edition_id_competition_id_kalakriti_competition_edition_id_id_fk" FOREIGN KEY ("edition_id","competition_id") REFERENCES "public"."kalakriti_competition"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "kalakriti_inventory_item_edition_name_idx" ON "kalakriti_inventory_item" USING btree ("edition_id","name","id");--> statement-breakpoint
CREATE INDEX "kalakriti_inventory_tx_edition_created_idx" ON "kalakriti_inventory_transaction" USING btree ("edition_id","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "kalakriti_inventory_tx_item_created_idx" ON "kalakriti_inventory_transaction" USING btree ("item_id","created_at" DESC NULLS LAST,"id");