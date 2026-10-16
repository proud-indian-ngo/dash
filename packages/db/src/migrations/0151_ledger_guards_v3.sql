-- Ledger guards v3 (see packages/db/src/ledger/immutability.ts, which
-- installs the same definitions in databases built with drizzle-kit push and
-- is checked against this file by immutability.test.ts). Adds the audited
-- figures (0150): audited_figures final except the one-time reversal stamp
-- and a creator or reverser becoming NULL; audited_figures_line append-only;
-- no TRUNCATE on either. The functions are replaced with the same bodies
-- (their version comment moves to v3). The maintenance switch
-- (SET LOCAL pi_dash.ledger_maintenance = 'on') turns them all off for one
-- transaction.
CREATE OR REPLACE FUNCTION "ledger_reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  col text;
BEGIN
  IF current_setting('pi_dash.ledger_maintenance', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  -- Trigger arguments name user columns that may only become NULL
  -- (ON DELETE SET NULL when a login is deleted).
  IF TG_OP = 'UPDATE' AND TG_NARGS > 0
     AND (to_jsonb(NEW) - TG_ARGV) = (to_jsonb(OLD) - TG_ARGV) THEN
    FOREACH col IN ARRAY TG_ARGV LOOP
      IF (to_jsonb(NEW) -> col) <> 'null'::jsonb
         AND (to_jsonb(NEW) -> col) IS DISTINCT FROM (to_jsonb(OLD) -> col) THEN
        RAISE EXCEPTION 'The books are append-only: UPDATE on % is not allowed', TG_TABLE_NAME
          USING ERRCODE = 'restrict_violation';
      END IF;
    END LOOP;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'The books are append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "opening_balance_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  stamp text[] := ARRAY['reversal_posting_id', 'reversed_at', 'reversed_by'];
  users text[] := ARRAY['created_by', 'reversed_by'];
BEGIN
  IF current_setting('pi_dash.ledger_maintenance', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- The one-time reversal stamp.
    IF OLD.reversal_posting_id IS NULL AND NEW.reversal_posting_id IS NOT NULL
       AND (to_jsonb(NEW) - stamp) = (to_jsonb(OLD) - stamp) THEN
      RETURN NEW;
    END IF;
    -- A deleted login's reference becoming NULL.
    IF (to_jsonb(NEW) - users) = (to_jsonb(OLD) - users)
       AND (NEW.created_by IS NULL OR NEW.created_by = OLD.created_by)
       AND (NEW.reversed_by IS NULL OR NEW.reversed_by = OLD.reversed_by) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'Opening balances are final: % on opening_balance is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "audited_figures_guard"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  stamp text[] := ARRAY['reversal_posting_id', 'reversal_reason', 'reversed_at', 'reversed_by'];
  users text[] := ARRAY['created_by', 'reversed_by'];
BEGIN
  IF current_setting('pi_dash.ledger_maintenance', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- The one-time reversal stamp (a skip or a match with nothing to post
    -- has no reversal posting, so the time marks it).
    IF OLD.reversed_at IS NULL AND NEW.reversed_at IS NOT NULL
       AND (to_jsonb(NEW) - stamp) = (to_jsonb(OLD) - stamp) THEN
      RETURN NEW;
    END IF;
    -- A deleted login's reference becoming NULL.
    IF (to_jsonb(NEW) - users) = (to_jsonb(OLD) - users)
       AND (NEW.created_by IS NULL OR NEW.created_by = OLD.created_by)
       AND (NEW.reversed_by IS NULL OR NEW.reversed_by = OLD.reversed_by) THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION 'Audited figures are final: % on audited_figures is not allowed', TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "ledger_reject_truncate"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('pi_dash.ledger_maintenance', true) = 'on' THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'The books are append-only: TRUNCATE on % is not allowed', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
COMMENT ON FUNCTION "ledger_reject_change"() IS 'pi-dash ledger guards v3';
--> statement-breakpoint
DROP TRIGGER IF EXISTS "posting_append_only" ON "posting";
--> statement-breakpoint
CREATE TRIGGER "posting_append_only" BEFORE UPDATE OR DELETE ON "posting" FOR EACH ROW EXECUTE FUNCTION "ledger_reject_change"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "ledger_entry_append_only" ON "ledger_entry";
--> statement-breakpoint
CREATE TRIGGER "ledger_entry_append_only" BEFORE UPDATE OR DELETE ON "ledger_entry" FOR EACH ROW EXECUTE FUNCTION "ledger_reject_change"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "account_movement_append_only" ON "account_movement";
--> statement-breakpoint
CREATE TRIGGER "account_movement_append_only" BEFORE UPDATE OR DELETE ON "account_movement" FOR EACH ROW EXECUTE FUNCTION "ledger_reject_change"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "movement_allocation_append_only" ON "movement_allocation";
--> statement-breakpoint
CREATE TRIGGER "movement_allocation_append_only" BEFORE UPDATE OR DELETE ON "movement_allocation" FOR EACH ROW EXECUTE FUNCTION "ledger_reject_change"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "fiscal_year_event_append_only" ON "fiscal_year_event";
--> statement-breakpoint
CREATE TRIGGER "fiscal_year_event_append_only" BEFORE UPDATE OR DELETE ON "fiscal_year_event" FOR EACH ROW EXECUTE FUNCTION "ledger_reject_change"('actor_id');
--> statement-breakpoint
DROP TRIGGER IF EXISTS "opening_balance_final" ON "opening_balance";
--> statement-breakpoint
CREATE TRIGGER "opening_balance_final" BEFORE UPDATE OR DELETE ON "opening_balance" FOR EACH ROW EXECUTE FUNCTION "opening_balance_guard"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "audited_figures_final" ON "audited_figures";
--> statement-breakpoint
CREATE TRIGGER "audited_figures_final" BEFORE UPDATE OR DELETE ON "audited_figures" FOR EACH ROW EXECUTE FUNCTION "audited_figures_guard"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "audited_figures_line_append_only" ON "audited_figures_line";
--> statement-breakpoint
CREATE TRIGGER "audited_figures_line_append_only" BEFORE UPDATE OR DELETE ON "audited_figures_line" FOR EACH ROW EXECUTE FUNCTION "ledger_reject_change"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "posting_no_truncate" ON "posting";
--> statement-breakpoint
CREATE TRIGGER "posting_no_truncate" BEFORE TRUNCATE ON "posting" FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_truncate"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "ledger_entry_no_truncate" ON "ledger_entry";
--> statement-breakpoint
CREATE TRIGGER "ledger_entry_no_truncate" BEFORE TRUNCATE ON "ledger_entry" FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_truncate"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "account_movement_no_truncate" ON "account_movement";
--> statement-breakpoint
CREATE TRIGGER "account_movement_no_truncate" BEFORE TRUNCATE ON "account_movement" FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_truncate"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "movement_allocation_no_truncate" ON "movement_allocation";
--> statement-breakpoint
CREATE TRIGGER "movement_allocation_no_truncate" BEFORE TRUNCATE ON "movement_allocation" FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_truncate"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "fiscal_year_event_no_truncate" ON "fiscal_year_event";
--> statement-breakpoint
CREATE TRIGGER "fiscal_year_event_no_truncate" BEFORE TRUNCATE ON "fiscal_year_event" FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_truncate"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "opening_balance_no_truncate" ON "opening_balance";
--> statement-breakpoint
CREATE TRIGGER "opening_balance_no_truncate" BEFORE TRUNCATE ON "opening_balance" FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_truncate"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "audited_figures_no_truncate" ON "audited_figures";
--> statement-breakpoint
CREATE TRIGGER "audited_figures_no_truncate" BEFORE TRUNCATE ON "audited_figures" FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_truncate"();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "audited_figures_line_no_truncate" ON "audited_figures_line";
--> statement-breakpoint
CREATE TRIGGER "audited_figures_line_no_truncate" BEFORE TRUNCATE ON "audited_figures_line" FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_truncate"();
