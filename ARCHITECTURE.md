# Architecture

Architecture docs moved to **[`docs/architecture/`](docs/architecture/index.md)**. Sharded for on-demand loading.

Start with [`docs/architecture/index.md`](docs/architecture/index.md) — topic map → chapter file. Agents should load the index first, then only the chapter(s) matching the current task.

## Chapters

- [Monorepo](docs/architecture/monorepo.md)
- [Data Layer (Zero + Drizzle)](docs/architecture/data-layer.md)
- [Auth](docs/architecture/auth.md)
- [Authorization](docs/architecture/authorization.md)
- [Recurring Events (RRULE)](docs/architecture/recurring-events.md)
- [Vendor Payments](docs/architecture/vendor-payments.md)
- [Notifications](docs/architecture/notifications.md)
- [File Uploads](docs/architecture/file-uploads.md)
- [Cash Vouchers](docs/architecture/cash-vouchers.md)
- [Observability](docs/architecture/observability.md)
- [Jobs](docs/architecture/jobs.md)
- [PDF Generation](docs/architecture/pdf.md)
- [Editor](docs/architecture/editor.md)
- [Shared Constants](docs/architecture/shared.md)
