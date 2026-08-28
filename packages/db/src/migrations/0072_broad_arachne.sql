ALTER TABLE "kalakriti_edition_membership" DROP CONSTRAINT "kalakriti_edition_membership_created_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "kalakriti_edition_membership" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "kalakriti_edition_membership" ADD CONSTRAINT "kalakriti_edition_membership_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;