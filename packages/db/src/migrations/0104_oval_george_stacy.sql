CREATE TABLE "kalakriti_award_command" (
	"id" uuid PRIMARY KEY NOT NULL,
	"edition_id" uuid NOT NULL,
	"actor_user_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kalakriti_award_handover" (
	"id" uuid PRIMARY KEY NOT NULL,
	"edition_id" uuid NOT NULL,
	"division_id" uuid NOT NULL,
	"entry_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"award" text NOT NULL,
	"awarded" boolean NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp NOT NULL,
	"updated_by" text,
	CONSTRAINT "kalakriti_award_handover_scope_uq" UNIQUE("edition_id","division_id","entry_id","student_id","award"),
	CONSTRAINT "kalakriti_award_handover_award_chk" CHECK ("kalakriti_award_handover"."award" IN ('winner', 'runner_up')),
	CONSTRAINT "kalakriti_award_handover_version_chk" CHECK ("kalakriti_award_handover"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "kalakriti_award_command" ADD CONSTRAINT "kalakriti_award_command_edition_id_kalakriti_edition_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."kalakriti_edition"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_award_handover" ADD CONSTRAINT "kalakriti_award_handover_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_award_handover" ADD CONSTRAINT "kalakriti_award_handover_division_fk" FOREIGN KEY ("edition_id","division_id") REFERENCES "public"."kalakriti_competition_division"("edition_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_award_handover" ADD CONSTRAINT "kalakriti_award_handover_entry_fk" FOREIGN KEY ("edition_id","division_id","entry_id") REFERENCES "public"."kalakriti_competition_entry"("edition_id","division_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kalakriti_award_handover" ADD CONSTRAINT "kalakriti_award_handover_student_fk" FOREIGN KEY ("edition_id","student_id") REFERENCES "public"."kalakriti_student"("edition_id","id") ON DELETE restrict ON UPDATE no action;