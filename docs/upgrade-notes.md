# Upgrade notes

One-off setup steps from [DEPLOYMENT.md](../DEPLOYMENT.md), still needed on a fresh environment.

## Organisation accounts

Seeded organisation accounts are dev-only. Before anyone records income, a `finance.manage` user creates the trust's bank, cash, fixed deposit and gateway clearing accounts in Settings → Organisation accounts (`/settings/org-accounts`), with fund source and, for FCRA accounts, the FCRA role. The "Deposited into" picker is empty until then.

## Razorpay setup

Test mode first:

1. Create a Razorpay gateway clearing account in Settings → Organisation accounts.
2. Set `RAZORPAY_KEY_ID` (`rzp_test_…`), `RAZORPAY_WEBHOOK_SECRET` (`openssl rand -hex 32`) and optionally `RAZORPAY_KEY_SECRET`, then restart.
3. In Settings → Integrations, confirm "Connected · test mode", copy the webhook URL, choose the clearing account and save. Adjust the notes keys if the Payment Page's field names differ.
4. On the Razorpay dashboard, in the same mode, add a webhook with that URL, the same secret, and events `payment.captured`, `order.paid`, `refund.processed` and `settlement.processed`.
5. Make a test payment; it appears on the Income page or the Imports tab.
6. Switch to the `rzp_live_…` key and a live-mode webhook. A test key on a production server records nothing.
7. With `RAZORPAY_KEY_SECRET` set, run "Import past payments" (at most 400 days per run) for earlier payments and settlements.

## Books and receipts

After the books, income posting and receipts migrations, a finance admin:

1. Enters opening balances at Finance → Books → Opening balances once the CA has confirmed the audited FY 2025-26 balance sheet. Never seed or script real figures.
2. Chooses Post pending on Finance → Books once. It backfills postings from 1 April 2026 and is safe to repeat; the `ledger-post-pending` job runs daily at 03:30 IST. Then clears the "Waiting to post" list.
3. Fills in Settings → Organisation accounts → Donation receipts (name, address, PAN, signatory, signature; issuing needs the signature) and checks the 80G URN and date. Never seed the real values.

- The server creates reference account heads on start; a code clash logs "Books reference data missing".
- Finance admins and super admins get the book-keeping permissions and `donors.receipt` automatically.
- Ledger tables refuse UPDATE, DELETE and TRUNCATE. A reviewed repair must run `SET LOCAL pi_dash.ledger_maintenance = 'on'` in its own transaction.
- Close a year after it ends and the previous year is closed. Enter audited figures after the CA signs.
- Receipt email needs `RESEND_API_KEY` and `EMAIL_FROM`. An invoice line is charged to the audit fee provision only when finance picks "Audit fees payable (provision)" at approval.

## Imports

Contribution CSV, give.do payout and bank statement imports need the organisation accounts above and `DATA_ENCRYPTION_KEY`; without the key, donors are created without PANs and PAN matching is off. The daily `expire-import-rows` job (02:30 IST) clears raw cells 180 days after a batch's last import, and unimported uploads after 30 days.

## Private media cutover

Uploads go to per-user `tmp/` keys that their mutation claims, hence the R2 lifecycle rule. The bucket has no public route. Unset `VITE_CDN_URL` once a release that no longer uses it deploys.

## Kalakriti

Do not roll back past the two-file music migrations (`0079`, `0080`) to single-file music code, which cannot hold two files.

## pg-boss event triggers

Event triggers are disabled only on the pg-boss connections, which needs PostgreSQL 17+ and superuser or SET privilege for `event_triggers`. Never disable them on `DATABASE_URL`, `ZERO_UPSTREAM_DB`, a role, a database or globally; Zero needs schema changes. See [jobs.md](architecture/jobs.md).

## Cost centres

`0155_cost_centres` to `0157_drop_city` swap `city` for `cost_centre_id`, dropping columns the old build reads ([Database setup](#database-setup)).

Before deploying, list Mumbai-series occurrences saved as Bangalore. The backfill fixes `fixed_by_backfill` rows (see the `0156` header); fix others by hand once deployed:

```sql
SELECT c.id, p.name AS series, c.original_date,
  (c.created_at = c.updated_at AND p.updated_at <= c.created_at) AS fixed_by_backfill
FROM team_event c JOIN team_event p ON p.id = c.series_id
WHERE c.city = 'bangalore' AND p.city = 'mumbai';
```

Then count requests whose city isn't their event's:

```sql
WITH event_city AS (
  SELECT e.id, CASE WHEN e.city = 'bangalore' AND p.city = 'mumbai'
      AND e.created_at = e.updated_at AND p.updated_at <= e.created_at
    THEN 'mumbai' ELSE e.city::text END AS city
  FROM team_event e LEFT JOIN team_event p ON p.id = e.series_id
)
SELECT
  (SELECT count(*) FROM reimbursement r JOIN event_city e ON e.id = r.event_id
     WHERE r.city::text <> e.city) AS reimbursements,
  (SELECT count(*) FROM vendor_payment v JOIN event_city e ON e.id = v.event_id
     WHERE v.city::text <> e.city) AS vendor_payments;
```

The migration's own counts: `SELECT value FROM app_config WHERE key = 'cost_centre_backfill';`.

The next posting run reposts every expense posting (rules version 3).

## Lead approval

Lead approval keeps already-pending requests with finance. Unsyncing payee bank columns rebuilds the replica; clients reload ([details](#zero-cache)).
