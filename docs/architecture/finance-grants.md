# Finance: grants

> **Load when**: grants, CSR or specific-grant agreements, tranches, grant budgets, utilisation, linking contributions to a grant.
> **Related**: `finance-and-programmes.md`, `finance-income.md`, `finance-books.md`, `file-uploads.md`

Finance → Grants (`/finance/grants`) tracks each CSR or specific-grant agreement against the money the trust already records. A grant is a tracking record over existing income and expense: it is never a fund and never posts, and the money stays in the General Fund (founder decision; question 10 in [finance-ledger-cutover.md](finance-ledger-cutover.md)).

## The grant

Schema `packages/db/src/schema/grant.ts`. The table is `grant_agreement` because `GRANT` is reserved in SQL.

- A grant has a grantor (a party with an active donor, sponsor or grantor role), a title, an agreement reference and date, a programme and project, start and end dates, the sanctioned amount, its donation type (CSR or specific grant), an optional Schedule VII item as the agreement words it, notes, and a status (active or closed).
- A grant funds exactly one project. A project may have several grants as long as their periods don't overlap (founder decision): an exclusion constraint on `(project_id, daterange(starts_on, ends_on, '[]'))` (btree_gist, in a custom migration, since Drizzle can't declare one) refuses an overlap, and `grant.save` says which grant clashes first. Spend therefore splits between a project's grants by date. A composite foreign key keeps the project under the grant's programme, and a project with a grant can't move to another programme.
- New grants need an active programme, never Unallocated.
- The signed agreement is one file on the grant, uploaded through `getGrantAgreementUploadUrl` (`finance.manage`) and claimed by `grant.setAgreement` under `attachments/grants/<id>/`. Downloads (`kind=grantAgreement`) need `finance.view` or `finance.manage`; see [file-uploads.md](file-uploads.md).
- A grant with linked contributions can't be deleted, and its grantor, programme and project can't change until they are unlinked.

## Tranches and received money

`grant_tranche` holds the expected schedule: date, amount and a note. Money received is the contributions linked to the grant, never a separate entry.

- The link is a nullable `grant_id` and `grant_tranche_id` on `contribution`. A gift counts towards at most one grant, and a grant funds one project, so a join table would add nothing. The columns let the database hold the rules: a composite foreign key `(grant_id, party_id, programme_id, project_id)` to the grant refuses another giver or project, `(grant_tranche_id, grant_id)` keeps the tranche on the same grant, and checks close the gaps composite keys leave when a column is null.
- A receipt dated inside one of the project's grant periods links only to that grant (`grantPeriodIssue`); the contribution sheet picks it. A receipt outside every period (an advance or a late tranche) may link to any of the project's grants, and the dialog says so.
- Only the grantor's money on the grant's programme and project can link: never a reversed contribution, and never an in-kind gift (`grantLinkIssue`, `packages/shared/src/grants.ts`; a check on `contribution` refuses in-kind too). The contribution sheet on the Income page shows the Grant fact to `finance.view`; `finance.manage` links, changes the tranche or unlinks there, and unlinks from the grant page.
- A linked contribution's donor and project can't change through the contribution form; finance must unlink it first. Removing a tranche keeps its contributions on the grant without a tranche.

## Budget

`grant_budget_line` holds one amount per expense head, the same budgetable heads as [Budgets](finance-and-programmes.md#budgets) (`budgetableHeadIds`). ₹0 is a budget; a blank head has none. Spend above a head's budget shows in red only.

## Utilisation

Actuals are never stored. `loadGrantUtilisation` (`packages/db/src/queries/grant-utilisation.ts`) answers a range `from`..`to`, and `grantUtilisation` (`packages/shared/src/grants.ts`) lays it out GFR 12-A style, so a certificate for any range can be computed from it.

- Receipts follow the contribution's current status: a gift later reversed drops out of every range, including ranges already reported.
- **Received**: linked contributions whose money arrived (received, receipted or refunded; not pending or reversed), gross, by received date.
- **Refunded**: their refunds, as their own lines by refund date, as GFR 12-A shows refunds separately.
- **Spent**: cash expense only (`medium = 'monetary'`) the books recognise on the grant's project, per expense head, by economic date. An entry counts when its date is within the grant's period. A reversal counts when the entry it reverses does, on the reversal's own date, so a void dated after the period still takes the spend off and a void of pre-start spend never goes negative.
- **Unspent brought forward**: received less refunded less spent before `from`. **Closing unspent**: brought forward plus received less refunded less spent in the range.
- An expense charged to an event counts when the event names the grant's project: finance sets an event's project (`finance.manage` only), occurrences inherit it, and its claims and vendor payments post with it. Changing an event's project stays allowed after its expenses post, and reposts them, except in a closed year. Before saving, the event form shows finance the posted spend that will move and between which grants (`getEventProjectMove`). When someone outside finance moves an event to another programme, its project clears and finance users get an inbox and email notice (Finance topic).
- Every figure is dated, so one range's closing is the next range's brought forward, and a later refund or void never changes an earlier range.
- The grant page defaults to the whole grant, up to its end date or to today once it has ended; the From and To pickers choose any period. The list's figures cover everything recorded.

## Screens and access

- Finance → Grants lists grantor, project, period, sanctioned, received, spent, unspent and status, filtered by status and programme.
- The grant page shows Sanctioned, Received (net of refunds), Spent and Unspent; the period's utilisation; tranches with expected amounts and what each has received to date, net of refunds; spend by head against the budget; linked contributions; and the agreement in the details column.
- Reading needs `finance.view`; grants sync only to it. Writing needs `finance.manage` through the audited `grant.*` mutators.

## Not built

- Utilisation certificates (PDF and DSC signing) build on these figures next.
- Interest earned on grant money, advances and commitments are not separated.
