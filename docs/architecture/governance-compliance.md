# Governance: compliance calendar

> **Load when**: compliance calendar, filing due dates, Form 112, ITR-7, Forms 113 and 114, TDS return, 80G or 12AB renewal, trustee term end item, compliance reminders, closing an item with evidence.
> **Related**: `governance.md` (register, vault, registrations), `finance-receipts-and-returns.md` (the donations return)

## Calendar

- The default items and their due dates are code (`packages/shared/src/compliance.ts`), in the April-to-March financial year. A renewal is due 183 days before an 80G or 12AB registration expires, the last day the Act allows an application; a term-end item 90 days before a trustee's last day.
- Templates are ensured by key on every server start. The app changes only their owner and whether they're on, so those edits survive a deploy. With no owner, an item goes to everyone with `governance.manage`.
- A daily job creates items for the next 400 days. Each carries a source key, so running it again adds nothing. Another reminds 30, 7 and 1 days before an open item is due.

## Items

- `governance.view` sees items; `governance.manage` changes them.
- Marking an item done needs a vault document as evidence; marking it not needed needs a reason. Closed items can be reopened, and one-off items added.
