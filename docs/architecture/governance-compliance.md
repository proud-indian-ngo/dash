# Governance: compliance calendar

> **Load when**: compliance calendar, filing due dates, Form 112, ITR-7, Forms 113 and 114, TDS return, 80G or 12AB renewal, trustee term end item, compliance reminders, closing an item with evidence.
> **Related**: `governance.md` (register, vault, registrations), `finance-receipts-and-returns.md` (the donations return)

## Calendar

The default calendar lives in `packages/shared/src/compliance.ts` with the occurrence and reminder rules. Dates fall in the April-to-March financial year.

| Item | Due |
|---|---|
| Audit report (Form 112) | 30 Sep |
| Income-tax return (ITR-7) | 31 Oct |
| Donations return (Forms 113 and 114) | 31 May |
| TDS return | Quarterly: 31 Jul, 31 Oct, 31 Jan, 31 May |
| Next year's budget approved (clause 7.7) | 31 Mar |
| Annual accounts approved by the Board | 15 Sep |
| Yearly report to principal donors | 30 Jun |
| Renew 80G or 12AB | 183 days before the registration expires |
| Trustee term ends | 90 days before the term's last day |

- Templates are ensured by key on every server start; only their owner and on/off change in the app, and those edits are kept. An owner is a user, or everyone with `governance.manage` when none is set.
- `generate-compliance-items` (daily, 02:45 IST) creates items for the next 400 days. Each carries a source key, so generating again adds nothing.
- `remind-compliance-items` (daily, 09:15 IST) reminds 30, 7 and 1 days before an open item is due, to its owner or to everyone with `governance.manage`. Topic Governance.

## Items

- Items sync through Zero (`governance.view`); `governance.manage` changes them.
- **Mark done** needs a document from the vault as evidence. **Not needed** needs a reason. Closed items can be reopened, and one-off items added.
- The page shows Open, Closed and All, grouped by month, with overdue and due-soon badges. Recurring items and their owners are in its menu.
