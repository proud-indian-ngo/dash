# Governance: compliance, declarations and policies

> **Load when**: compliance calendar, filing due dates, Form 112, ITR-7, Forms 113 and 114, TDS return, 80G or 12AB renewal, trustee term end item, compliance reminders, closing an item with evidence, annual approvals pack, Form 109 accumulation, declaration of interests, related party, payment warning, policy register, policy acknowledgement, child safeguarding, "Works with children".
> **Related**: `governance.md` (register, vault, registrations), `governance-resolutions.md`, `finance-receipts-and-returns.md` (the donations return), `teams-and-events.md`, `vendor-payments.md`

## Calendar

- The default items and their due dates are code (`packages/shared/src/compliance.ts`), in the April-to-March financial year. A renewal is due 183 days before an 80G or 12AB registration expires, the last day the Act allows an application; a term-end item 90 days before a trustee's last day.
- Form 109 (accumulation of income) is due 31 August, two months before the income-tax return; the CA has yet to confirm the date. In a year with nothing set apart it is marked not needed.
- Templates are ensured by key on every server start. The app changes only their owner and whether they're on, so those edits survive a deploy. With no owner, an item goes to everyone with `governance.manage`.
- A daily job creates items for the next 400 days. Each carries a source key, so running it again adds nothing. Another reminds 30, 7 and 1 days before an open item is due.

## Items

- `governance.view` sees items; `governance.manage` changes them.
- Marking an item done needs a vault document as evidence; marking it not needed needs a reason. Closed items can be reopened, and one-off items added.
- The budget, the annual accounts, the auditor's appointment and accumulation of income have resolution templates. Their items open a new circular from the template, and close with the passed resolution as evidence.

## Declarations of interests

- Once a financial year, each trustee in office lists the people and organisations they or a relative are connected to that deal or may deal with the trust, or declares none (clause 5.3). Declaring again replaces it. The declaration's PDF is filed in the vault.
- Trustees in office who haven't declared for the year are asked on their dashboard. `governance.view` sees everyone's status.
- **Payment warning**: on a vendor payment, anyone with `requests.approve` is warned when the vendor's name matches a trustee in office on the invoice date (clause 7.24 allows trustees expenses only) or a party a trustee declared for that year. Names are compared without case, honorifics, company suffixes and punctuation (`paymentWarnings` in `packages/shared/src/declarations.ts`). It warns and never blocks, because a name match isn't proof.

## Policy register

- A policy is for everyone with an account or for trustees. Each version is an approved vault document with the day it takes effect, after the version before.
- Everyone a policy is for is asked on their dashboard to read the version in force and acknowledge it. Any signed-in user may read it.

### Child-safeguarding gate

- The child-safeguarding policy is ensured on every server start and gates events with children: Kalakriti events, and events of a team marked as working with children.
- Once one of its versions is in force, anyone who hasn't acknowledged that version can't join such an event, show interest, be approved or added by a lead, be enrolled or assigned in Kalakriti, or join through a WhatsApp RSVP. The refusal says what to do. With no version in force, nothing is gated.
- Every one of those paths checks on the server (`packages/zero/src/mutators/safeguarding.ts`, and `safeguardingBlocks` for the RSVP), so a new join path must call it too.
- Not gated: sign-up through an event registration link (the new volunteer sees the policy on their dashboard), volunteers carried into recurring occurrences, and Kalakriti local volunteers without accounts.

Not built: CSR utilisation certificates, which wait for grants in the ledger (finance Phase 5).
