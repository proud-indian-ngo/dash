-- Drizzle's jsonb on the Bun SQL driver stored values as jsonb strings
-- holding JSON text ("{\"rrule\":...}" instead of {"rrule":...}). Writes now
-- go through packages/db/src/schema/jsonb.ts; this unwraps the rows already
-- written. Only strings whose text is valid JSON for an object or array are
-- touched, so a run on already-correct data changes nothing.

UPDATE "advance_payment_history"
SET "metadata" = ("metadata" #>> '{}')::jsonb
WHERE jsonb_typeof("metadata") = 'string'
  AND CASE
    WHEN pg_input_is_valid("metadata" #>> '{}', 'jsonb')
      THEN jsonb_typeof(("metadata" #>> '{}')::jsonb) IN ('object', 'array')
    ELSE false
  END;
--> statement-breakpoint
UPDATE "audit_log"
SET "metadata" = ("metadata" #>> '{}')::jsonb
WHERE jsonb_typeof("metadata") = 'string'
  AND CASE
    WHEN pg_input_is_valid("metadata" #>> '{}', 'jsonb')
      THEN jsonb_typeof(("metadata" #>> '{}')::jsonb) IN ('object', 'array')
    ELSE false
  END;
--> statement-breakpoint
UPDATE "event_rsvp_vote"
SET "selected_option_hashes" = ("selected_option_hashes" #>> '{}')::jsonb
WHERE jsonb_typeof("selected_option_hashes") = 'string'
  AND CASE
    WHEN pg_input_is_valid("selected_option_hashes" #>> '{}', 'jsonb')
      THEN jsonb_typeof(("selected_option_hashes" #>> '{}')::jsonb) IN ('object', 'array')
    ELSE false
  END;
--> statement-breakpoint
UPDATE "kalakriti_audit_entry"
SET "metadata" = ("metadata" #>> '{}')::jsonb
WHERE jsonb_typeof("metadata") = 'string'
  AND CASE
    WHEN pg_input_is_valid("metadata" #>> '{}', 'jsonb')
      THEN jsonb_typeof(("metadata" #>> '{}')::jsonb) IN ('object', 'array')
    ELSE false
  END;
--> statement-breakpoint
UPDATE "kalakriti_award_command"
SET "payload" = ("payload" #>> '{}')::jsonb
WHERE jsonb_typeof("payload") = 'string'
  AND CASE
    WHEN pg_input_is_valid("payload" #>> '{}', 'jsonb')
      THEN jsonb_typeof(("payload" #>> '{}')::jsonb) IN ('object', 'array')
    ELSE false
  END;
--> statement-breakpoint
UPDATE "kalakriti_result"
SET "scorecard_ids" = ("scorecard_ids" #>> '{}')::jsonb
WHERE jsonb_typeof("scorecard_ids") = 'string'
  AND CASE
    WHEN pg_input_is_valid("scorecard_ids" #>> '{}', 'jsonb')
      THEN jsonb_typeof(("scorecard_ids" #>> '{}')::jsonb) IN ('object', 'array')
    ELSE false
  END;
--> statement-breakpoint
UPDATE "kalakriti_result_revision"
SET "scorecard_ids" = ("scorecard_ids" #>> '{}')::jsonb
WHERE jsonb_typeof("scorecard_ids") = 'string'
  AND CASE
    WHEN pg_input_is_valid("scorecard_ids" #>> '{}', 'jsonb')
      THEN jsonb_typeof(("scorecard_ids" #>> '{}')::jsonb) IN ('object', 'array')
    ELSE false
  END;
--> statement-breakpoint
UPDATE "reimbursement_history"
SET "metadata" = ("metadata" #>> '{}')::jsonb
WHERE jsonb_typeof("metadata") = 'string'
  AND CASE
    WHEN pg_input_is_valid("metadata" #>> '{}', 'jsonb')
      THEN jsonb_typeof(("metadata" #>> '{}')::jsonb) IN ('object', 'array')
    ELSE false
  END;
--> statement-breakpoint
UPDATE "scheduled_message"
SET "attachments" = ("attachments" #>> '{}')::jsonb
WHERE jsonb_typeof("attachments") = 'string'
  AND CASE
    WHEN pg_input_is_valid("attachments" #>> '{}', 'jsonb')
      THEN jsonb_typeof(("attachments" #>> '{}')::jsonb) IN ('object', 'array')
    ELSE false
  END;
--> statement-breakpoint
UPDATE "social_run"
SET "errors" = ("errors" #>> '{}')::jsonb
WHERE jsonb_typeof("errors") = 'string'
  AND CASE
    WHEN pg_input_is_valid("errors" #>> '{}', 'jsonb')
      THEN jsonb_typeof(("errors" #>> '{}')::jsonb) IN ('object', 'array')
    ELSE false
  END;
--> statement-breakpoint
UPDATE "social_run"
SET "skipped" = ("skipped" #>> '{}')::jsonb
WHERE jsonb_typeof("skipped") = 'string'
  AND CASE
    WHEN pg_input_is_valid("skipped" #>> '{}', 'jsonb')
      THEN jsonb_typeof(("skipped" #>> '{}')::jsonb) IN ('object', 'array')
    ELSE false
  END;
--> statement-breakpoint
UPDATE "team_event"
SET "recurrence_rule" = ("recurrence_rule" #>> '{}')::jsonb
WHERE jsonb_typeof("recurrence_rule") = 'string'
  AND CASE
    WHEN pg_input_is_valid("recurrence_rule" #>> '{}', 'jsonb')
      THEN jsonb_typeof(("recurrence_rule" #>> '{}')::jsonb) IN ('object', 'array')
    ELSE false
  END;
--> statement-breakpoint
UPDATE "team_event"
SET "reminder_intervals" = ("reminder_intervals" #>> '{}')::jsonb
WHERE jsonb_typeof("reminder_intervals") = 'string'
  AND CASE
    WHEN pg_input_is_valid("reminder_intervals" #>> '{}', 'jsonb')
      THEN jsonb_typeof(("reminder_intervals" #>> '{}')::jsonb) IN ('object', 'array')
    ELSE false
  END;
--> statement-breakpoint
UPDATE "vendor_payment_history"
SET "metadata" = ("metadata" #>> '{}')::jsonb
WHERE jsonb_typeof("metadata") = 'string'
  AND CASE
    WHEN pg_input_is_valid("metadata" #>> '{}', 'jsonb')
      THEN jsonb_typeof(("metadata" #>> '{}')::jsonb) IN ('object', 'array')
    ELSE false
  END;
--> statement-breakpoint
UPDATE "vendor_payment_transaction_history"
SET "metadata" = ("metadata" #>> '{}')::jsonb
WHERE jsonb_typeof("metadata") = 'string'
  AND CASE
    WHEN pg_input_is_valid("metadata" #>> '{}', 'jsonb')
      THEN jsonb_typeof(("metadata" #>> '{}')::jsonb) IN ('object', 'array')
    ELSE false
  END;
