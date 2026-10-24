# Backups and restore

Production PostgreSQL runs on Dokploy, which backs it up daily. The bucket, schedule, retention and last good run are on the Backups tab of the pi-dash database in Dokploy; check there, and use its Test button for a backup on demand. Dokploy's backup is a `pg_dump` of `POSTGRES_DB` (`pi-dash`), so it holds every schema in that database: `public`, `private`, `pgboss` and zero-cache's own state.

The database backup does not hold:

- Files in R2 (attachments, payment proof, vouchers, receipts, photos). Nothing in this repo backs up the bucket.
- The env. Keep `DATA_ENCRYPTION_KEY` outside the database backup; without it, PANs, bank numbers and donor IDs are unreadable and import hashes stop matching ([env-and-secrets.md](architecture/env-and-secrets.md)). Keep `BETTER_AUTH_SECRET`, `POSTGRES_PASSWORD`, `RAZORPAY_WEBHOOK_SECRET`, `ZERO_ADMIN_PASSWORD` and the other secrets with it.
- zero-cache's replica (`/data/zero.db` in the `zero_cache_data` volume).

To restore:

1. Stop `web` and `zero-cache`.
2. On the Backups tab choose Restore, pick the bucket and backup file, and enter database `pi-dash`. Dokploy runs `pg_restore --clean --if-exists`, replacing everything in that database.
3. Delete `/data/zero.db*` (or the `zero_cache_data` volume). Wiping the replica is always safe; zero-cache rebuilds it from Postgres and clients resync.
4. Start the stack. `migrate` applies any newer migrations, and the server re-applies the ledger guards (`ensureLedgerTriggers()`) on start.

After a restore:

- Work since the backup is gone and must be re-entered.
- pg-boss is back at the backup's state, so jobs queued then run again. Notifications sent since the backup may go out twice, because the send logs rolled back too.
- Files uploaded since the backup are no longer referenced. The monthly `cleanup-r2-orphans` job (1st, 04:00) deletes them, so re-attach or download them before then.
- Razorpay: run "Sync now" (last three days) or "Import past payments" in Settings → Integrations. Duplicates are skipped ([finance-income.md](architecture/finance-income.md)).
- Re-import give.do payouts and bank statements since the backup, then choose Books → Post pending.

Test a restore into a scratch database every quarter.
