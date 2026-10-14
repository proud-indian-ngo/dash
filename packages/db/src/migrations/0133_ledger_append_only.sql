-- The books are append-only (finance-and-programmes.md section 3.8 rule 1):
-- a correction is a reversal posting plus a replacement, never an edit. The
-- application has no update or delete path; this trigger also refuses one
-- from ad-hoc SQL, scripts or a future code path. A privileged maintenance
-- session (a retention process, or a reviewed repair) can switch it off for
-- its own transaction with
--   SET LOCAL pi_dash.ledger_maintenance = 'on';
-- TRUNCATE is a statement-level operation and is not covered (test resets).
CREATE OR REPLACE FUNCTION "ledger_reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('pi_dash.ledger_maintenance', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'The books are append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "posting_append_only" BEFORE UPDATE OR DELETE ON "posting"
  FOR EACH ROW EXECUTE FUNCTION "ledger_reject_change"();
--> statement-breakpoint
CREATE TRIGGER "ledger_entry_append_only" BEFORE UPDATE OR DELETE ON "ledger_entry"
  FOR EACH ROW EXECUTE FUNCTION "ledger_reject_change"();
--> statement-breakpoint
CREATE TRIGGER "account_movement_append_only" BEFORE UPDATE OR DELETE ON "account_movement"
  FOR EACH ROW EXECUTE FUNCTION "ledger_reject_change"();
--> statement-breakpoint
CREATE TRIGGER "movement_allocation_append_only" BEFORE UPDATE OR DELETE ON "movement_allocation"
  FOR EACH ROW EXECUTE FUNCTION "ledger_reject_change"();
