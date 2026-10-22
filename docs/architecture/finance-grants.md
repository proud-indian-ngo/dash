# Finance: grants

> **Load when**: grants, CSR or specific-grant agreements, tranches, grant budgets, utilisation, utilisation certificates, linking contributions to a grant.
> **Related**: `finance-and-programmes.md`, `finance-income.md`, `finance-books.md`, `file-uploads.md`

Finance → Grants (`/finance/grants`) tracks each CSR or specific-grant agreement over income and expense already recorded. A grant never posts and is never a fund: the money stays in the General Fund (founder decision; question 10 in [finance-ledger-cutover.md](finance-ledger-cutover.md)).

## The grant

Schema `packages/db/src/schema/grant.ts`. The table is `grant_agreement` because `GRANT` is reserved in SQL.

- A grant has a grantor (a party with an active donor, sponsor or grantor role), a title, an agreement reference and date, a programme and project, start and end dates, the sanctioned amount, its donation type (CSR or specific grant), an optional Schedule VII item as the agreement words it, whether the agreement needs a CA certificate, notes, and a status (active or closed).
- A grant funds one project; a project's grants never overlap in time (founder decision), held by an exclusion constraint on `(project_id, daterange(starts_on, ends_on, '[]'))` in a custom migration, and `grant.save` names the clashing grant. Spend splits between them by date. A composite foreign key keeps the project under the grant's programme, and such a project can't change programme.
- New grants need an active programme other than Unallocated.
- The signed agreement is one file, claimed by `grant.setAgreement` under `attachments/grants/<id>/`; downloads (`kind=grantAgreement`) need `finance.view` or `finance.manage` ([file-uploads](file-uploads.md)).
- A grant with linked contributions or certificates can't be deleted, and its grantor, programme and project can't change while contributions are linked.

## Tranches and received money

`grant_tranche` holds the expected schedule: date, amount and a note. Money received is the contributions linked to the grant, never a separate entry.

- The link is a nullable `grant_id` and `grant_tranche_id` on `contribution` (a gift counts towards one grant, so no join table). Composite foreign keys `(grant_id, party_id, programme_id, project_id)` and `(grant_tranche_id, grant_id)` refuse another giver, project or grant's tranche; checks cover null columns.
- A receipt dated inside one of the project's grant periods links only to that grant (`grantPeriodIssue`); one outside every period (an advance or a late tranche) may link to any of them.
- Only the grantor's money on the grant's programme and project can link, never reversed or in-kind (`grantLinkIssue`; a check on `contribution` refuses in-kind too). The contribution sheet on the Income page shows the Grant fact to `finance.view`; `finance.manage` links, changes the tranche or unlinks there, and unlinks from the grant page.
- A linked contribution's donor and project can't change through the contribution form; finance must unlink it first. Removing a tranche keeps its contributions on the grant without a tranche.

## Budget

`grant_budget_line` holds one amount per expense head, the same budgetable heads as [Budgets](finance-and-programmes.md#budgets) (`budgetableHeadIds`). ₹0 is a budget; a blank head has none. Spend above a head's budget shows in red only.

## Utilisation

Actuals are never stored. `loadGrantUtilisation` (`packages/db/src/queries/grant-utilisation.ts`) answers a range `from`..`to`, and `grantUtilisation` (`packages/shared/src/grants.ts`) lays it out GFR 12-A style, so a certificate for any range can be computed from it.

- Receipts follow the contribution's current status: a gift later reversed drops out of every range, including ranges already reported.
- **Received**: linked contributions whose money arrived (received, receipted or refunded; not pending or reversed), gross, by received date.
- **Refunded**: their refunds, as their own lines by refund date, as GFR 12-A shows refunds separately.
- **Spent**: cash expense (`medium = 'monetary'`) on the grant's project, per head, by economic date within the grant's period. A reversal counts when the entry it reverses does, on its own date, so a void after the period still takes the spend off.
- **Unspent brought forward**: received less refunded less spent before `from`. **Closing unspent**: brought forward plus received less refunded less spent in the range.
- An expense charged to an event counts when the event names the grant's project: finance sets an event's project (`finance.manage` only), occurrences inherit it, and its claims and vendor payments post with it. Changing an event's project stays allowed after its expenses post, and reposts them, except in a closed year or under a certificate (see [Lock and drift](#lock-and-drift)). The event form first shows the posted spend that would move (`getEventProjectMove`). When someone outside finance moves an event to another programme, its project clears and finance gets an inbox and email notice.
- Every figure is dated, so one range's closing is the next range's brought forward, and a later refund or void never changes an earlier range.
- The grant page defaults to the whole grant; From and To pick any period.

## Screens and access

- Finance → Grants lists grantor, project, period, sanctioned, received, spent, unspent and status, filtered by status and programme.
- The grant page shows Sanctioned, Received (net of refunds), Spent and Unspent; the period's utilisation; tranches with what each has received to date, net of refunds; spend by head against the budget; its certificates; linked contributions; and the agreement in the details column.
- Reading needs `finance.view`; grants sync only to it. Writing needs `finance.manage` through the audited `grant.*` mutators.

## Utilisation certificates

A certificate covers any period within the grant, GFR 12-A style. No law requires the trust to issue one or a CA's certificate: CSR Rule 4(5) puts certifying on the company, which asks for them by contract.

- **Prepare** (`finance.manage`): period, place and interest earned. A grant's live certificates never overlap. Interest isn't separated in the books, so finance enters it (default ₹0); it enters the chain, and earlier certificates' interest is brought forward. Preparing freezes `grantUtilisation`'s figures into a snapshot, numbers it (`UC/2026-27/001`, gap-free per financial year from a locked counter row) and stores the PDF rendered from the snapshot with both signature fields, in one transaction. Name, address and PAN come from the receipt settings; 12AB, 80G and CSR-1 from Governance → Registrations.
- **PDF** (`packages/pdf/src/utilisation-certificate.tsx`): particulars, the balance chain with each receipt and refund, spend by head against budget, the GFR 12-A certification adapted to CSR, and a signature page with both trustees' boxes and, when asked, a CA slot.
- **Sign**: the Head of the Organisation (Managing Trustee), then the Chief Finance Officer (Treasurer, or the Joint Managing Trustee while no other trustee is), fixed at preparing; two holders of one office are refused. A signer must still hold that office when signing, else finance withdraws it and prepares again. Each signs with the DSC helper or Acrobat under the governance checks ([signing](governance-resolutions.md#signing)), appending to the latest copy. Signers need no finance permission: they open only what they sign, listed on their dashboard, with an inbox and email notice.
- **CA**: when the agreement needs one (frozen at preparing), finance then records the UDIN and the countersigned PDF or CA report, making it final; otherwise both signatures do.
- **Withdraw**: discard before the first signature, cancel with a reason after; both keep the number. Downloads are audited.

### Lock and drift

A live certificate holds its grant's figures up to its end. Linking, unlinking or deleting a contribution received by then, moving an event's project so spend dated by then enters or leaves the grant, and changing the grant's project or dates where that touches the period are refused, naming the certificate. Other changes (a void in the period, a reversed gift) show as "Figures changed since signing", listing what changed.

Advances and commitments are not separated.
