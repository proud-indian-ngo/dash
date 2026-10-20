# Architecture chapters

Each chapter covers one subsystem. Agents route to chapters through the agent guide (`.ruler/agent-guide.md`); this list is for people.

| Chapter | Covers |
|---|---|
| [audit-log](audit-log.md) | The audit ledger: what is audited, row lifecycle, allowed metadata |
| [auth](auth.md) | Better Auth, sessions, sign-in and the session cache |
| [authorization](authorization.md) | Permissions, roles and how checks run on server and client |
| [caching](caching.md) | Auth and permission caches, rate limiting |
| [cash-vouchers](cash-vouchers.md) | Cash vouchers, the voucher limit and voucher PDFs |
| [data-layer](data-layer.md) | Zero, Drizzle, sync, queries, mutators and SSR loaders |
| [design-language](design-language.md) | Product visual design: tokens, fonts, page, sheet and menu conventions |
| [e2e-testing](e2e-testing.md) | Playwright setup, seeds, auth state and E2E commands |
| [editor](editor.md) | The Plate rich-text editor |
| [env-and-secrets](env-and-secrets.md) | Environment contracts, secrets and worktree ports |
| [file-uploads](file-uploads.md) | R2 uploads, attachments, media reads and Immich |
| [finance-and-programmes](finance-and-programmes.md) | Finance overview: status, decisions, programmes and dimensions, Charged to, deferred work |
| [finance-income](finance-income.md) | Donors, contributions, CSV imports, Razorpay, give.do payouts |
| [finance-bank-statements](finance-bank-statements.md) | Bank statement lines, credit and debit matching, bank charges |
| [finance-books](finance-books.md) | Ledger, posting engine, opening balances, year close, posting rules, audited figures, CA workbook |
| [finance-receipts-and-returns](finance-receipts-and-returns.md) | Donation receipts and the donations return (Form 113/114) |
| [finance-ledger-cutover](finance-ledger-cutover.md) | Ledger cutover: opening balances, backfill, posting rules and CA handoff |
| [governance](governance.md) | Trustee register, deed versions, documents vault, registrations and the signing service |
| [governance compliance](governance-compliance.md) | The compliance calendar and annual approvals, declarations of interests and the payment warning, the policy register and the child-safeguarding gate |
| [governance meetings](governance-meetings.md) | Board meetings: notice, attendance, quorum and votes per item, minutes signed by the chair |
| [governance resolutions](governance-resolutions.md) | Circular resolutions: issue, responses, signing with the DSC helper or Acrobat, numbering, register changes and long-term copies |
| [jobs](jobs.md) | pg-boss handlers, schedules and retries |
| [kalakriti-registration](kalakriti-registration.md) | Kalakriti Editions, registration, event-day operations, results and awards |
| [monorepo](monorepo.md) | Workspaces, Turborepo and the Docker package layout |
| [notifications](notifications.md) | Inbox, email and WhatsApp delivery, batching and digests |
| [observability](observability.md) | Structured logging with evlog |
| [pdf](pdf.md) | The PDF package: vouchers, receipts and ID cards |
| [recurring-events](recurring-events.md) | Recurring events and RRULE handling |
| [shared](shared.md) | Client-safe constants in `@pi-dash/shared` |
| [social-api](social-api.md) | Social API, tokens, signed photo links and the Social page |
| [reimbursements](reimbursements.md) | Reimbursement lifecycle, payouts by bank or UPI, claim for others, financial-year export |
| [teams-and-events](teams-and-events.md) | Teams, events, attendance, updates, photos, feedback, interest, orientation and smaller pages |
| [vendor-payments](vendor-payments.md) | Vendors, vendor payments, transactions and invoice approval |

Also see the [query performance audit](../query-performance-audit.md), the [repository map](../../project-structure.md) and [DEPLOYMENT.md](../../DEPLOYMENT.md).
