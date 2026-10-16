/**
 * The SQL of the books' database guards, shared by the latest
 * `NNNN_ledger_guards*` migration (0151, checked by immutability.test.ts)
 * and `ensureLedgerTriggers` (immutability.ts).
 */

/**
 * Bumped whenever anything below changes, together with a new custom
 * migration named `NNNN_ledger_guards_<version>` generated from this file
 * (immutability.test.ts checks the latest one).
 */
export const LEDGER_GUARD_VERSION = "pi-dash ledger guards v3";

export const LEDGER_FUNCTION_STATEMENTS: readonly string[] = [
  `CREATE OR REPLACE FUNCTION "ledger_reject_change"() RETURNS trigger
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
$$`,
  `CREATE OR REPLACE FUNCTION "opening_balance_guard"() RETURNS trigger
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
$$`,
  `CREATE OR REPLACE FUNCTION "audited_figures_guard"() RETURNS trigger
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
$$`,
  `CREATE OR REPLACE FUNCTION "ledger_reject_truncate"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('pi_dash.ledger_maintenance', true) = 'on' THEN
    RETURN NULL;
  END IF;
  RAISE EXCEPTION 'The books are append-only: TRUNCATE on % is not allowed', TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$`,
  `COMMENT ON FUNCTION "ledger_reject_change"() IS '${LEDGER_GUARD_VERSION}'`,
];

export interface LedgerTrigger {
  create: string;
  name: string;
  table: string;
}

const rowGuard = (table: string, args = ""): LedgerTrigger => ({
  create: `CREATE TRIGGER "${table}_append_only" BEFORE UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION "ledger_reject_change"(${args})`,
  name: `${table}_append_only`,
  table,
});

const truncateGuard = (table: string): LedgerTrigger => ({
  create: `CREATE TRIGGER "${table}_no_truncate" BEFORE TRUNCATE ON "${table}" FOR EACH STATEMENT EXECUTE FUNCTION "ledger_reject_truncate"()`,
  name: `${table}_no_truncate`,
  table,
});

const LEDGER_TABLES = [
  "posting",
  "ledger_entry",
  "account_movement",
  "movement_allocation",
  "fiscal_year_event",
  "opening_balance",
  "audited_figures",
  "audited_figures_line",
] as const;

export const LEDGER_TRIGGERS: readonly LedgerTrigger[] = [
  rowGuard("posting"),
  rowGuard("ledger_entry"),
  rowGuard("account_movement"),
  rowGuard("movement_allocation"),
  rowGuard("fiscal_year_event", "'actor_id'"),
  {
    create: `CREATE TRIGGER "opening_balance_final" BEFORE UPDATE OR DELETE ON "opening_balance" FOR EACH ROW EXECUTE FUNCTION "opening_balance_guard"()`,
    name: "opening_balance_final",
    table: "opening_balance",
  },
  {
    create: `CREATE TRIGGER "audited_figures_final" BEFORE UPDATE OR DELETE ON "audited_figures" FOR EACH ROW EXECUTE FUNCTION "audited_figures_guard"()`,
    name: "audited_figures_final",
    table: "audited_figures",
  },
  rowGuard("audited_figures_line"),
  ...LEDGER_TABLES.map(truncateGuard),
];
