CREATE TABLE "private"."vendor_legacy_details" (
	"address" text,
	"bank_account_ifsc_code" text NOT NULL,
	"bank_account_name" text NOT NULL,
	"bank_account_number" text NOT NULL,
	"contact_email" text,
	"contact_phone" text NOT NULL,
	"moved_at" timestamp NOT NULL,
	"pan_number" text,
	"vendor_id" uuid PRIMARY KEY NOT NULL
);
--> statement-breakpoint
-- Every vendor becomes a party with the vendor role, keeping its UUID.
INSERT INTO "party" ("id", "kind", "display_name", "created_by", "created_at", "updated_at")
SELECT v."id", 'organisation'::"party_kind", v."name", v."created_by", v."created_at", v."updated_at"
FROM "vendor" v
ON CONFLICT ("id") DO NOTHING;--> statement-breakpoint
INSERT INTO "party_role" ("id", "party_id", "role", "active", "since")
SELECT gen_random_uuid(), v."id", 'vendor'::"party_role_kind", true, v."created_at"
FROM "vendor" v
ON CONFLICT ("party_id", "role") DO NOTHING;--> statement-breakpoint
-- Contact, PAN and bank details leave the public table in the same step, so
-- they stop replicating at once; the backfill script encrypts them later.
INSERT INTO "private"."vendor_legacy_details"
  ("vendor_id", "address", "bank_account_ifsc_code", "bank_account_name", "bank_account_number", "contact_email", "contact_phone", "pan_number", "moved_at")
SELECT v."id", v."address", v."bank_account_ifsc_code", v."bank_account_name", v."bank_account_number", v."contact_email", v."contact_phone", v."pan_number", now()
FROM "vendor" v
ON CONFLICT ("vendor_id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "private"."vendor_legacy_details" ADD CONSTRAINT "vendor_legacy_details_vendor_id_vendor_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendor"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor" ADD CONSTRAINT "vendor_id_party_id_fk" FOREIGN KEY ("id") REFERENCES "public"."party"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor" DROP COLUMN "address";--> statement-breakpoint
ALTER TABLE "vendor" DROP COLUMN "bank_account_ifsc_code";--> statement-breakpoint
ALTER TABLE "vendor" DROP COLUMN "bank_account_name";--> statement-breakpoint
ALTER TABLE "vendor" DROP COLUMN "bank_account_number";--> statement-breakpoint
ALTER TABLE "vendor" DROP COLUMN "contact_email";--> statement-breakpoint
ALTER TABLE "vendor" DROP COLUMN "contact_phone";--> statement-breakpoint
ALTER TABLE "vendor" DROP COLUMN "pan_number";