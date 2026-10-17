# Finance: donors and income

Donors and other parties, contributions and other income, CSV and give.do imports, Razorpay ingestion with refunds and settlements, give.do payouts and the Reached bank filter.

Overview and decisions in [finance-and-programmes.md](finance-and-programmes.md); bank lines in [finance-bank-statements.md](finance-bank-statements.md); how income posts in [finance-books.md](finance-books.md).

## Parties and donors

Schema `packages/db/src/schema/party.ts` and `packages/db/src/schema/private/`.

- Contact details, ID numbers, bank accounts and collection events live in the `private` Postgres schema, which is outside zero-cache's publication, so it never replicates. Identifiers are AES-GCM encrypted with `DATA_ENCRYPTION_KEY`.
- `donors.view` reads contact details; `finance.view_sensitive` reveals the full identifier. The reveal is audited although it is a read.
- Donor writes go through the audited server functions in `apps/web/src/functions/parties.ts`. Deleting a donor with gifts is refused.
- Vendors are parties with the `vendor` role; see `vendor-payments.md`.

### Tax certificate opt-out

A donor with `party.tax_certificate_opt_out` is left out of the return and never chased for an ID, but still needs a name and address, because a gift without them counts as anonymous for tax (section 115BBC and its successor). Per gift, `deduction_eligible` follows the donor, includes or excludes; Exclude needs a reason. Include beats the opt-out but never the legal exclusions.

## Contributions and other income

Rules in `packages/shared/src/income.ts` and its neighbours; mutators in `packages/zero/src/mutators/income.ts`.

- The Income page is readable with `donors.view`, `finance.view`, `donors.manage` or `finance.manage` (the "four income permissions"). Contributions are written with `donors.manage`, other income with `finance.manage`.
- A contribution's party must hold an active donor, sponsor, grantor or intermediary role. Platform intermediaries such as GiveIndia are never the giver unless they also hold a giving role. The Unallocated programme is refused.
- "Received" means `received` or `receipted`, and net received subtracts refunds. The stats, the donor's giving and "Missing donor details" share these definitions.

### Channel rules

| Channel | Account | Reporting mode |
|---|---|---|
| Razorpay | The Razorpay clearing account set in Settings | Electronic, locked |
| give.do | A gateway clearing account other than Razorpay's | Electronic, locked |
| UPI, NEFT/IMPS | A bank account | Electronic |
| Cheque | A bank account | Electronic, or other for a bearer cheque |
| Cash | A bank or cash account | Cash |
| In kind | None | In kind |

The form, the mutators and imports all enforce this through `withChannelRules`. Changing the Razorpay clearing account after go-live is a migration: earlier unsettled gifts stay in the old account and must be moved first.

### Donation type rules

- Specific grant and CSR need a programme; corpus has none; voluntary and other may name one.
- Only a corpus gift goes to the Corpus Fund, and a corpus gift always does. The books credit corpus gifts to the Corpus Fund even when an older record names the wrong fund.
- Existing records are held to these rules only when saved.

### Locks on a contribution

Once a refund is recorded, a processed settlement has paid it out, or a bank line is matched to it, the amount, donor, date, account and channel are fixed and the gift can't be deleted; classification fields stay editable. A gift with any receipt, voided ones included, can't be deleted.

### Other income

`other_income` records non-donation income into an account. It never enters donation filings.

## Imports

Each upload is an `import_batch` (synced; settings and counts only). Rows sit in `private.import_row`; the file itself is not stored, only its SHA-256. `private.external_identity` records each provider's external ID once, with the contribution it became and a payload hash. Code starts in `apps/web/src/lib/income-import/`.

### CSV imports

- Non-UTF-8 files are refused. The mapping is remembered per source.
- Rows are classified on every review and again inside the import transaction. A known identity with the same payload links; a changed payload is a conflict, never overwritten. Without an external ID column a fingerprint (date, amount, donor name, reference) stands in, so two identical gifts without a reference become one.
- A donor is picked automatically only on an exact stored identifier (narrowed by ID type and last four characters, then decrypted; there is no blind index). Shared identifiers and email, phone or name matches are proposals; undecided rows are skipped. A name matches an existing contributor's display or legal name, or an earlier row, ignoring case and spacing; rows with different ID numbers are never proposed. Choosing an earlier row makes both one new donor. Accepting an existing donor can fill only its empty fields.
- An optional Donor type column makes the new donor an organisation (organisation, organization, org, company, trust) or a person (person, individual); blank is a person, anything else a cell error. It stays out of the payload hash, so re-uploading a file with the column added links rather than conflicts.
- A reference match, or the same donor, day and amount, is a possible duplicate the reviewer must confirm.
- Rows are validated against the donor form's rules at review, so an importable row can't fail at save.
- Each donor gets one `collection_event` per batch.
- A run is one transaction under an advisory lock shared with retention and payout imports: all decided rows or none. Retrying reprocesses only unfinished rows.
- Audit rows carry counts only. Errors pass through `apps/web/src/lib/safe-errors.ts`, because a query error's message carries row cells. Identifiers are masked to the last four characters wherever rows are shown.

### give.do CSV

- An exact-header preset maps the give.do export. Its transaction ID is the external identity.
- Non-INR rows are refused, because FCRA is not activated.
- Every run ensures the GiveIndia intermediary party and records it as "Through" on each gift.
- Recurring give.do donations get no special handling yet.

### Import hashes and the key

Row hashes, payload hashes and fingerprint IDs are HMAC-SHA256 under a key derived from `DATA_ENCRYPTION_KEY`, or outside production while it is unset, from `BETTER_AUTH_SECRET`. The `h1:` prefix names the scheme, not the key. Changing the key changes every new hash: re-uploads without external IDs are no longer recognised, and rows with external IDs show as conflicts. Treat the key as fixed once imports exist; re-hashing is not built.

### Import retention

The daily `expire-import-rows` job nulls `raw` 180 days after a batch's last run and deletes the rows of a batch never imported after 30 days. It never touches pending or held rows, contributions, identities or collection events. Razorpay rows get their 180 days only once they reach an outcome.

## Razorpay ingestion

On only when `RAZORPAY_KEY_ID` and `RAZORPAY_WEBHOOK_SECRET` are set; `RAZORPAY_KEY_SECRET` adds API reads (fetch by ID, reconcile, settlements). The key prefix gives the mode (`live` or `test`), used as the identity's provider account so live and test IDs never mix. A test key on a production server is refused everywhere: deliveries are acknowledged and logged, nothing is stored, and Settings shows a blocking error. Code: `apps/web/src/lib/razorpay/`.

The Razorpay account takes only donations (founder), so every captured payment is treated as one.

### Webhook and sync

- `POST /api/razorpay/webhook` verifies the signature over the raw body, stages captured payments in that India day's batch, and queues `razorpay-sync-payment` keyed by payment ID.
- Staging keeps allow-listed payment fields only (no card, bank or VPA) and only the notes whose keys match the configured notes keys. Decision: a notes key added later can't be read from payments staged before it.
- A redelivery is found by payment ID or external identity (`import_row.external_id` survives retention), so a payment is never staged twice.
- The job classifies the payment with the CSV rules: India date of capture, voluntary, General Fund, fee net of GST, donor from the notes. An exact PAN match or a new donor imports at once; email, phone or name matches and possible duplicates wait for review. Non-INR and never-captured payments are errors; a payment refunded since capture is recorded and its refunds apply separately.
- Payments without a usable clearing account wait; saving one re-queues them.
- Webhooks and jobs are outside the audit ledger.

### Reconcile and backfill

- One job, `razorpay-reconcile`, on an exclusive queue: one run at a time, no retry.
- It first re-syncs payments stuck for over an hour. With the key secret it then walks India days, listing payments, refunds and settlements through a paced client, and sends each through the webhook's path, so nothing is counted twice.
- Scheduled every 6 hours over today and the three days before.
- Settings → Integrations has "Sync now" and "Import past payments" (at most 400 days), both `finance.manage` and audited. Decision: these replace a backfill CLI so nobody needs a shell on production.

### Refunds

- `contribution_refund` is written only by the server. Only processed refunds count; manual refunds are not built.
- Each refund is an external identity, so reapplying is a no-op and a different amount is flagged.
- A full refund turns a `received` or `pending` gift `refunded`; a partial refund is derived, not a status. A `receipted` gift keeps its status and the refund is flagged.
- Decision: a refund whose payment isn't a contribution yet waits indefinitely and is applied by the transaction that creates it.

### Settlements

- `gateway_settlement` (synced to `finance.view` and `finance.manage` only, written by the server) holds each payout, with `gateway_settlement_item` linking each line to its contribution or refund. Recon notes are never stored.
- Decision: the unique (provider, mode, settlement ID) is the identity; no `external_identity` row.
- Razorpay settlements come from the API only, and only once final. Unlinked lines are linked when their contribution is created. A differing fee is flagged, never written over.
- "Awaiting settlement" is computed line by line: the net of every Razorpay gift of the server's mode with no processed settlement line, less its unsettled refunds.

## give.do payout XLSX

Needs both `donors.manage` and `finance.manage`. Code: `apps/web/src/lib/give-do-payout/`.

- Reads a workbook with exact headers, after ZIP bomb checks. Each file has one UTR; gross must equal charges plus payable and the two sheets must agree. Non-INR rows fail the FCRA guard.
- It records a processed settlement (provider `give_do`, UTR as ID) against the chosen clearing account. Settled on defaults to the upload date, since the workbook has none.
- Known transactions link by identity. The reviewer may import unknown donations in the same run; otherwise their items stay unlinked until a later give.do CSV import.
- Payout evidence fills a zero contribution fee; a different fee is flagged. A repeated UTR never rewrites its settlement.
- After commit, bank matches are refreshed in a separate transaction, which can be retried.
- Fixtures are synthetic (`packages/e2e/fixtures/give-do/generate.ts`). Never use a donor export.

## Reached bank filter

Reached bank is derived, never stored, and shown only to finance. Yes: a processed settlement payment item (even before its bank line is matched) or a matched bank line. Not yet: an unsettled gateway gift or an unmatched direct gift. Not applicable: in kind, or cash without an account.
