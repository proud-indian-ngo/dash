CREATE TYPE "public"."event_rsvp_poll_source" AS ENUM('event_group', 'team_group');--> statement-breakpoint
CREATE TYPE "public"."event_rsvp_selection" AS ENUM('yes', 'no', 'unknown');--> statement-breakpoint
CREATE TABLE "event_rsvp_poll" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"target_chat_jid" text NOT NULL,
	"target_chat_source" "event_rsvp_poll_source" NOT NULL,
	"message_id" text NOT NULL,
	"question" text NOT NULL,
	"yes_option_hash" text NOT NULL,
	"no_option_hash" text NOT NULL,
	"sent_at" timestamp NOT NULL,
	"closed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "event_rsvp_vote" (
	"id" uuid PRIMARY KEY NOT NULL,
	"poll_id" uuid NOT NULL,
	"user_id" text,
	"phone" text NOT NULL,
	"vote_message_id" text NOT NULL,
	"selected_option_hashes" jsonb NOT NULL,
	"selected_option" "event_rsvp_selection" NOT NULL,
	"voted_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_event" ADD COLUMN "post_rsvp_poll" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_rsvp_poll" ADD CONSTRAINT "event_rsvp_poll_event_id_team_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."team_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvp_vote" ADD CONSTRAINT "event_rsvp_vote_poll_id_event_rsvp_poll_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."event_rsvp_poll"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_rsvp_vote" ADD CONSTRAINT "event_rsvp_vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_rsvp_poll_eventId_uidx" ON "event_rsvp_poll" USING btree ("event_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_rsvp_poll_messageId_uidx" ON "event_rsvp_poll" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "event_rsvp_poll_targetChatJid_idx" ON "event_rsvp_poll" USING btree ("target_chat_jid");--> statement-breakpoint
CREATE UNIQUE INDEX "event_rsvp_vote_pollId_phone_uidx" ON "event_rsvp_vote" USING btree ("poll_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "event_rsvp_vote_voteMessageId_uidx" ON "event_rsvp_vote" USING btree ("vote_message_id");--> statement-breakpoint
CREATE INDEX "event_rsvp_vote_userId_idx" ON "event_rsvp_vote" USING btree ("user_id");