# Proud Indian Dashboard

The dashboard Proud Indian's volunteers, team leads and admins use to run the organisation. It covers people and roles, events, expense claims and vendor payments, the Kalakriti competition, income, receipts and the books. Data syncs in real time through Rocicorp Zero.

Volunteers aged 18 or over can register at `/register` and verify their email. Admins can also create accounts directly.

## Stack

The libraries are in each `package.json`. The external services are:

| Layer | Services |
|---|---|
| Delivery | Resend, WhatsApp Cloud API and the GoWA gateway |
| Storage | Cloudflare R2, Immich for event photos |

## What it does

- People and access: users, roles and permissions, bans, password resets, orientation tracking. See [auth](docs/architecture/auth.md) and [authorization](docs/architecture/authorization.md).
- Requests and expenses: reimbursements and advance payments with line items, approval, cash vouchers, payee signatures, payment proof and "Charged to". See [reimbursements](docs/architecture/reimbursements.md), [cash vouchers](docs/architecture/cash-vouchers.md) and [finance overview](docs/architecture/finance-and-programmes.md).
- Vendors: supplier profiles, vendor payments, payment transactions and invoice approval. See [vendor payments](docs/architecture/vendor-payments.md).
- Events and teams: teams with leads, one-time and recurring events, attendance, interest requests, updates, photos synced to Immich, anonymous feedback. See [teams and events](docs/architecture/teams-and-events.md) and [recurring events](docs/architecture/recurring-events.md).
- Analytics: spending over time, and outcomes (children reached, volunteer hours and their value) derived from recorded events. See [outcomes](docs/architecture/finance-and-programmes.md#outcomes).
- Kalakriti: yearly Editions with Center registration, competitions, schedules, scanning, food, transport, inventory, results, awards and ID cards. See [Kalakriti registration](docs/architecture/kalakriti-registration.md) and the [glossary](CONTEXT.md).
- Income, donors, receipts and books: donors, contributions (manual, CSV, give.do and Razorpay), settlements, bank statements, the donations return, donation receipts and the ledger. See [finance overview](docs/architecture/finance-and-programmes.md), which links the income, bank statement, books and receipts chapters.
- Budgets: a year's budget per programme and project by expense head, against the books' actual spending. See [finance overview](docs/architecture/finance-and-programmes.md#budgets).
- Notifications and WhatsApp: in-app inbox, email and WhatsApp with per-topic preferences and digests, and a delivery page for admins. See [notifications](docs/architecture/notifications.md) and [jobs](docs/architecture/jobs.md).
- Social and public APIs: the bearer-token Social API and Social page, and the public upcoming-events feed used by proudindian.ngo. See [social API](docs/architecture/social-api.md).
- Governance: the trustee register with evidence for every date, the deed's rules by version, the trust's registrations, a vault of governance documents with signatures checked, and circular resolutions signed by DSC and numbered when they pass. See [governance](docs/architecture/governance.md) and [resolutions](docs/architecture/governance-resolutions.md).
- Audit log: immutable history of user actions, visible with `audit_log.view`.
- Settings: profile, account, notifications and bank accounts for everyone; organisation settings (programmes, projects, cost centres shown to volunteers as City), roles, integrations, API tokens and maintenance by permission.

## Getting started

Requires Bun and Docker.

1. Install dependencies: `bun install`
2. Configure the environment: `cp .env.sample .env`, then fill in the values. See [DEPLOYMENT.md](DEPLOYMENT.md#environment-variables) for the full list.
3. Start PostgreSQL: `bun run db:start`
4. Apply migrations: `bun run db:migrate`
5. Generate the Zero schema: `bun run zero:generate`
6. Optional: seed data with `bun run seed`, or create the first admin by setting `ADMIN_EMAIL` and `ADMIN_PASSWORD` and running `bun run auth:seed-admin`.
7. Start everything: `bun run dev`

| Service | URL |
|---|---|
| Web app | http://localhost:3001 |
| Zero cache | http://localhost:4848 |
| Drizzle Studio | http://localhost:5555 |

## Scripts

Scripts are in `package.json`. `bun run db:push` is for local development only. E2E tests run against a dedicated database and stack; see [E2E testing](docs/architecture/e2e-testing.md).

## Documentation

- [Architecture chapters](docs/architecture/index.md)
- [DEPLOYMENT.md](DEPLOYMENT.md): hosting, environment variables and build steps
- [CONTEXT.md](CONTEXT.md): Kalakriti glossary
- [project-structure.md](project-structure.md): repository map
- [REVIEW_GUIDELINES.md](REVIEW_GUIDELINES.md): code review guidelines
