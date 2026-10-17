# Finance: donors and income

Donors and other parties, contributions and other income, CSV and give.do imports, Razorpay ingestion with refunds and settlements, give.do payouts and the Reached bank filter.

Overview and decisions in [finance-and-programmes.md](finance-and-programmes.md); bank lines in [finance-bank-statements.md](finance-bank-statements.md); how income posts in [finance-books.md](finance-books.md).

## Parties and donors

Tables in `packages/db/src/schema/party.ts` and `packages/db/src/schema/private/`.

| Table | Holds | Sync |
|---|---|---|
| `party` | Kind (person, organisation), display name, `tax_certificate_opt_out` | Zero, to `donors.view` or `finance.view` |
| `party_role` | donor, sponsor, grantor, intermediary, vendor, volunteer, judge, partner; active | Zero, same guard |
| `private.party_private` | Contact, address, ID type, ID number (encrypted) | Server only |
| `private.party_bank_account` | Account number (encrypted), IFSC, active | Server only |
| `private.collection_event` | Processing basis, purpose, channel, notice note per collection | Server only |
| `user.party_id` | Optional link from a login | |

- The `private` Postgres schema is outside zero-cache's publication, so it never replicates. Identifiers are AES-GCM encrypted with `DATA_ENCRYPTION_KEY` (`packages/db/src/encryption.ts`).
- Permissions: `donors.view` (admins and finance) reads contact details; `finance.view_sensitive` reveals the full identifier. The reveal (`party.identifier.reveal`) is audited although it is a read.
- Donor writes go through the audited `saveDonor` / `savePartyInTransaction` (`apps/web/src/functions/parties.ts`). Deleting a donor with gifts is refused.
- Vendors are parties with the `vendor` role; the `vendor` row is the synced supplier profile. See `vendor-payments.md`.

### Tax certificate opt-out

`party.tax_certificate_opt_out` is the donor form's "Doesn't want a tax certificate (80G)". Such donors are left out of the return and never chased for an ID, but still need a name and address, because a gift without them counts as anonymous for tax (section 115BBC and its successor). Per gift, "Tax certificate" (Follow donor, Include, Exclude) is stored in `deduction_eligible` (`unknown`, `yes`, `no`); Exclude needs `eligibility_reason`. Include beats the opt-out but never the legal exclusions.

## Contributions and other income

Schema `packages/db/src/schema/income.ts`; rules in `packages/shared/src/income.ts`, `contribution-channel.ts`, `contribution-programme.ts`; mutators `packages/zero/src/mutators/income.ts`.

- The Income page (`/income`) is readable with `donors.view`, `finance.view`, `donors.manage` or `finance.manage` (the "four income permissions"). Contributions are written with `donors.manage`, other income with `finance.manage`, through the central mutation audit boundary.
- A contribution names a party with an active donor, sponsor, grantor or intermediary role, a channel, Form 113 reporting mode, donation type, deposit account (none for in kind, which needs a description and valuation basis), fund and optional programme and project. The Unallocated programme is refused. Platform intermediaries (`PLATFORM_INTERMEDIARY_PARTY_IDS`, `canGive`) are never the giver unless they also hold a giving role.
- Manual entries are `received`, source `manual`, and editable or deletable only while `pending` or `received`.
- "Received" means `received` or `receipted` (`CONTRIBUTION_RECEIVED_STATUSES`); `netReceivedPaise` subtracts refunds. Both are shared by the stats, the donor Giving section and "Missing donor details" (donors with a gift in the return lacking an ID, or any received gift lacking a name or address with PIN).

### Channel rules

| Channel | Account | Reporting mode |
|---|---|---|
| Razorpay | The Razorpay clearing account set in Settings (`app_config.razorpay_clearing_account_id`) | Electronic, locked |
| give.do | A gateway clearing account other than Razorpay's (any while none is set) | Electronic, locked |
| UPI, NEFT/IMPS | A bank account | Electronic |
| Cheque | A bank account | Electronic, or other for a bearer cheque |
| Cash | A bank or cash account | Cash |
| In kind | None | In kind |

The form, the mutators and imports all enforce this (`withChannelRules` in `apps/web/src/lib/income-import/normalize.ts`). Changing the Razorpay clearing account after go-live is a migration: earlier unsettled gifts stay in the old account and must be moved before editing.

### Donation type rules

- Specific grant and CSR need a programme; corpus has none (the form clears programme and project); voluntary and other may name one.
- Only a corpus gift goes to the Corpus Fund, and a corpus gift always does (`donationTypeFundIssue`). Older gifts against the wrong fund are flagged "Check fund"; saving fixes them, and the books credit corpus gifts to the Corpus Fund regardless.
- Existing records are held to these rules only when saved.

### Locks on a contribution

Once a refund is recorded, a processed settlement has paid it out, or a bank line is matched to it, the amount, donor, date, account and channel are fixed and the gift can't be deleted; classification fields stay editable. The mutator checks under the contribution's row lock. A gift with any receipt, voided ones included, can't be deleted.

### Other income

`other_income` (kind interest, grant return, asset income, misc) records non-donation income into an account. It never enters donation filings.

## Imports

`import_batch` (public, synced to the four income permissions; settings, counts and file name only) records each upload. `private.import_row` holds each row as uploaded in `raw`; the file itself is not stored, only its SHA-256. `private.external_identity` records (provider, provider account, entity type, external ID) uniquely, with the contribution it became and a payload hash. `contribution.import_batch_id` lets the Income table filter by import. Code: `apps/web/src/lib/income-import/`, `apps/web/src/functions/income-import.ts`, `packages/db/src/queries/income-import.ts`.

### CSV imports

`/income/import` (`donors.manage`): Upload, Map columns, Review, Import.

- Parsed with papaparse on both sides; broken rows are errors and non-UTF-8 files are refused. The mapping is remembered per source.
- Rows are classified on every review and again inside the import transaction. A known identity with the same payload links (`linked_existing`); a changed payload is a conflict, never overwritten. Without an external ID column a fingerprint (date, amount, donor name, reference) stands in, so two identical gifts without a reference become one.
- A donor is picked automatically only on an exact stored identifier (narrowed by ID type and last four characters, then decrypted; no blind index). Shared identifiers and email or phone matches are proposals; undecided rows are skipped. Accepting one offers "Fill missing details" (`fillMissingPartyDetails`), which fills only empty fields.
- A reference match, or the same donor, day and amount, is a possible duplicate the reviewer must confirm.
- Rows are validated against the donor form's rules at review, so an importable row can't fail at save. Invalid PANs, emails or phones are dropped with a warning.
- Each donor gets one `collection_event` per batch (basis `voluntary_provision_7a`).
- A run is one transaction under an advisory lock shared with retention and payout imports: all decided rows or none. Retrying reprocesses only unfinished rows.
- Audit: `import_batch.create`, `.review`, `.run` with counts only. Errors pass through `apps/web/src/lib/safe-errors.ts` (Postgres code, constraint, table only), because a query error's message carries row cells. Identifiers and PAN- or Aadhaar-shaped text are masked to the last four characters wherever rows are shown.

### give.do CSV

- An exact-header preset (`GIVE_DO_COLUMNS`, `apps/web/src/lib/income-import/fields.ts`) maps the export. Day-first dates, channel `give_do`, PAN as ID type. Transaction ID is the external identity under provider `give_do`, provider account the clearing account ID.
- A Currency field refuses non-INR rows ("Foreign currency: FCRA is not activated", `isRupeeCurrency`).
- Every run ensures the party "GiveIndia (give.do)" (`GIVE_INDIA_PARTY_ID`, intermediary, also seeded) and sets it as `intermediary_party_id` ("Through").
- Recurring give.do donations get no special handling yet.

### Import hashes and the key

Row hashes, payload hashes and fingerprint IDs are HMAC-SHA256 under a key derived (HKDF) from `DATA_ENCRYPTION_KEY`, or outside production while it is unset, from `BETTER_AUTH_SECRET`. The `h1:` prefix names the scheme, not the key. Changing the key changes every new hash: re-uploads without external IDs are no longer recognised, and rows with external IDs show as conflicts. Treat the key as fixed once imports exist; re-hashing is not built.

### Import retention

The daily `expire-import-rows` job (`packages/db/src/import-retention.ts`) nulls `raw` 180 days after a batch's last run and deletes the rows of a batch never imported after 30 days (marking it `expired`). It first resets batches stuck `importing` over 24 hours to `failed`. It never touches pending or held rows, contributions, identities or collection events. Razorpay rows get their 180 days only once they reach an outcome.

## Razorpay ingestion

On only when `RAZORPAY_KEY_ID` and `RAZORPAY_WEBHOOK_SECRET` are set; `RAZORPAY_KEY_SECRET` adds API reads (fetch by ID, reconcile, settlements). The key prefix gives the mode (`live` or `test`), used as the identity's provider account so live and test IDs never mix. A test key on a production server is refused everywhere: deliveries are acknowledged and logged, nothing is stored, and Settings shows a blocking error. Code: `apps/web/src/lib/razorpay/`, `packages/db/src/queries/razorpay-import.ts`.

The Razorpay account takes only donations (founder), so every captured payment is treated as one.

### Webhook and sync

- `POST /api/razorpay/webhook` verifies `X-Razorpay-Signature` (constant-time HMAC of the raw body) and caps the body at 1 MB. `payment.captured` and `order.paid` stage the payment in its India day's `razorpay_api` batch (one per mode and day) and queue `razorpay-sync-payment` keyed by payment ID.
- Staging keeps allow-listed payment fields only (no card, bank or VPA) and only the notes whose keys match the configured notes keys. Decision: a notes key added later can't be read from payments staged before it.
- A redelivery is found by payment ID or external identity (`import_row.external_id` survives retention), so a payment is never staged twice.
- The job classifies the payment with the CSV rules: India date of `created_at`, channel `razorpay`, voluntary, General Fund, fee net of GST, donor from the notes (`razorpay_notes_keys`). An exact PAN match or a new donor imports at once as the system; email or phone matches and possible duplicates wait `needs_review`. Non-INR and never-captured payments are errors; a payment refunded since capture is recorded and its refunds apply separately.
- Other waiting reasons: `queued`, `sync_failed`, `no_clearing_account`, `clearing_account_inactive`. Saving a clearing account re-queues them. `import_batch.pending_count` counts waiting rows.
- Webhooks and jobs are outside the audit ledger.

### Reconcile and backfill

- One job, `razorpay-reconcile {from, to, reason}`, on an exclusive pg-boss queue (one run at a time, no retry, heartbeat, stops before its 4-hour expiry).
- It first re-syncs payments stuck `queued` or `sync_failed` for over an hour. With the key secret it then walks India days, listing payments, refunds and settlements through a paced client (250 ms apart, backoff on 429), and sends each through the webhook's path, so nothing is counted twice.
- Scheduled every 6 hours over today and the three days before.
- Settings → Integrations has "Sync now" (last three days) and "Import past payments" (at most 400 days, key secret required), both `finance.manage`, audited as `razorpay.sync` and `razorpay.backfill`. Decision: these replace a backfill CLI so nobody needs a shell on production. Run state lives in `app_config` (`razorpay_reconcile_run`, `razorpay_last_reconcile`), dates and counts only.
- The same page (`finance.view`; saving the clearing account and notes keys needs `finance.manage`, audited `razorpay_settings.update`) shows mode, webhook URL, last webhook and sync, waiting counts and "Needs attention" flags.

### Refunds

- `contribution_refund` (synced to the four income permissions, written only by the server): amount, refunded on, source `razorpay` (`manual` reserved, not built), reference, flags `refund_after_receipt` and `amount_changed`. Only processed refunds count.
- `refund.processed` holds a verified copy in `private.pending_refund` and queues `razorpay-sync-refund`. Each refund is an external identity, so reapplying is a no-op and a different amount sets `amount_changed` once.
- A full refund turns a `received` or `pending` gift `refunded`; a partial one shows "Partly refunded ₹X" (derived). A `receipted` gift keeps its status and the refund is flagged.
- Decision: a refund whose payment isn't a contribution yet waits indefinitely and is applied by the transaction that creates it.

### Settlements

- `gateway_settlement` (synced to `finance.view` and `finance.manage` only, written by the server): provider, mode, settlement ID (`setl_…`, instant `setlod_…`), clearing account, status, settled on, net amount, totals recounted from its lines, UTR, `amount_changed`. `gateway_settlement_item` holds each line (payment, refund, transfer, adjustment) linked to its contribution or refund. Recon notes are never stored.
- Decision: the unique (provider, mode, settlement ID) is the identity; no `external_identity` row.
- Settlements come from the API only (reconcile, or `settlement.processed` → `razorpay-sync-settlement`), and only once final. Unlinked lines are linked when their contribution is created. A differing fee is flagged, never written over.
- "Awaiting settlement" is computed line by line: the net of every Razorpay gift of the server's mode with no processed settlement line, less its unsettled refunds.
- Income → Settlements (`finance.view` or `finance.manage`) lists both providers with a breakdown sheet. Contribution sheets show the settlement and UTR; Razorpay gifts link to the Razorpay dashboard.

## give.do payout XLSX

`/income/payout/import` (both `donors.manage` and `finance.manage`). Code: `apps/web/src/lib/give-do-payout/`, `apps/web/src/functions/give-do-payouts.ts`, `packages/db/src/queries/give-do-payouts.ts`.

- Reads an XLSX with exact `Donations` and `Campaign Level` headers, up to 5 MB and 5,000 rows, after ZIP bomb checks. Each file has one UTR; gross must equal charges plus payable and the two sheets must agree. Non-INR rows fail the FCRA guard.
- It records a processed settlement (provider `give_do`, mode `live`, UTR as ID) against the chosen clearing account. Settled on defaults to the upload date, since the workbook has none.
- Known transactions link by identity. The reviewer may import unknown donations in the same run; otherwise their items stay unlinked until a later give.do CSV import.
- Payout evidence fills a zero contribution fee; a different fee is flagged. A repeated UTR never rewrites its settlement.
- After commit, bank matches are refreshed in a separate transaction; "Find matches" retries a failure.
- Fixtures are synthetic (`bun packages/e2e/fixtures/give-do/generate.ts`). Never use a donor export.

## Reached bank filter

The Contributions table's Reached bank facet (`finance.view` or `finance.manage` only) is derived, never stored. Yes: a processed settlement payment item (even before its bank line is matched) or a matched bank line. Not yet: an unsettled gateway gift or an unmatched direct gift. Not applicable: in kind, or cash without an account.
