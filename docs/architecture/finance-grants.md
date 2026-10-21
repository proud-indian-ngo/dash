# Finance: grants

> **Load when**: grants, CSR or specific-grant agreements, tranches, grant budgets, utilisation, linking contributions to a grant.
> **Related**: `finance-and-programmes.md`, `finance-income.md`, `finance-books.md`, `file-uploads.md`

Finance → Grants (`/finance/grants`) tracks each CSR or specific-grant agreement against the money the trust already records. A grant is a tracking record over existing income and expense: it is never a fund and never posts, and the money stays in the General Fund (founder decision; question 10 in [finance-ledger-cutover.md](finance-ledger-cutover.md)).

## The grant

Schema `packages/db/src/schema/grant.ts`. The table is `grant_agreement` because `GRANT` is reserved in SQL.

- A grant has a grantor (a party with an active donor, sponsor or grantor role), a title, an agreement reference and date, a programme and project, start and end dates, the sanctioned amount, its donation type (CSR or specific grant), an optional Schedule VII item as the agreement words it, notes, and a status (active or closed).
- A grant funds exactly one project, and a project has at most one grant (founder decision). A unique key on the project enforces it, and a composite foreign key keeps the project under the grant's programme. A project with a grant can't move to another programme.
- New grants need an active programme, never Unallocated.
- The signed agreement is one file on the grant, uploaded through `getGrantAgreementUploadUrl` (`finance.manage`) and claimed by `grant.setAgreement` under `attachments/grants/<id>/`. Downloads (`kind=grantAgreement`) need `finance.view` or `finance.manage`; see [file-uploads.md](file-uploads.md).
- A grant with linked contributions can't be deleted, and its grantor, programme and project can't change until they are unlinked.

## Tranches and received money

`grant_tranche` holds the expected schedule: date, amount and a note. Money received is the contributions linked to the grant, never a separate entry.

- The link is a nullable `grant_id` and `grant_tranche_id` on `contribution`. A gift counts towards at most one grant, and a grant funds one project, so a join table would add nothing. The columns let the database hold the rules: a composite foreign key `(grant_id, party_id, programme_id, project_id)` to the grant refuses another giver or project, `(grant_tranche_id, grant_id)` keeps the tranche on the same grant, and checks close the gaps composite keys leave when a column is null.
- Only the grantor's contributions on the grant's programme and project can link, and never a reversed one (`grantLinkIssue`, `packages/shared/src/grants.ts`). The contribution sheet on the Income page shows the Grant fact to `finance.view`; `finance.manage` links, changes the tranche or unlinks there, and unlinks from the grant page.
- A linked contribution's donor and project can't change through the contribution form until it is unlinked. Removing a tranche keeps its contributions on the grant without a tranche.

## Budget

`grant_budget_line` holds one amount per expense head, the same budgetable heads as [Budgets](finance-and-programmes.md#budgets) (`budgetableHeadIds`). ₹0 is a budget; a blank head has none. Spend above a head's budget shows in red only.

## Utilisation

Actuals are never stored. `loadGrantUtilisation` (`packages/db/src/queries/grant-utilisation.ts`) answers a range `from`..`to`, and `grantUtilisation` (`packages/shared/src/grants.ts`) lays it out GFR 12-A style, so a certificate for any range can be computed from it.

- **Received**: linked contributions whose status counts as received, by received date, each net of its refunds (`netReceivedPaise`). Pending and reversed gifts are not received.
- **Spent**: the expense the books recognise on the grant's project, by economic date between the grant's start and end dates, net of reversals, per expense head. These are the same entries as Budgets' `loadBudgetActuals`; spend outside the period or on another project never counts.
- **Unspent brought forward**: received before `from` less spent before it. **Closing unspent**: brought forward plus received less spent in the range.
- The grant page defaults to the whole grant, up to its end date or to today once it has ended; the From and To pickers choose any period. The list's figures cover everything recorded.

## Screens and access

- Finance → Grants lists grantor, project, period, sanctioned, received, spent, unspent and status, filtered by status and programme.
- The grant page shows Sanctioned, Received, Spent and Unspent; the period's utilisation; tranches with expected and received amounts; spend by head against the budget; linked contributions; and the agreement in the details column.
- Reading needs `finance.view`; grants sync only to it. Writing needs `finance.manage` through the audited `grant.*` mutators.

## Not built

- Utilisation certificates (PDF and DSC signing) build on these figures next.
- Interest earned on grant money, advances and commitments are not separated.
