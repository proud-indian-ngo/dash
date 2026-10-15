/**
 * Check which DATA_ENCRYPTION_KEY opens every encrypted value (and
 * reproduces every keyed hash) in the database, and re-encrypt values
 * written under an old key.
 *
 * Usage:
 *   bun run secrets:check [--yes]
 *   bun run secrets:rekey [--dry-run] [--yes]
 *
 * DATA_ENCRYPTION_KEY must be the key the app runs with against this
 * database; OLD_DATA_ENCRYPTION_KEY (optional for check, required for rekey)
 * is a candidate key the unreadable values were written with. Prints counts,
 * row IDs and key fingerprints only, never values or keys. `check` exits 1
 * when anything needs action. See "Encryption key mismatch: check and rekey"
 * in DEPLOYMENT.md.
 */
import { db } from "@pi-dash/db";
import { confirmDatabaseTarget } from "@pi-dash/db/database-target";
import { keyFingerprint, loadKey, parseDataKey } from "@pi-dash/db/encryption";
import {
  checkStoredSecrets,
  RekeyRefusedError,
  rekeyStoredSecrets,
} from "@pi-dash/db/queries/secrets-rekey";
import {
  formatReports,
  type KeyPair,
  needsAction,
} from "@pi-dash/db/secret-keys";
import { env } from "@pi-dash/env/server";

const USAGE = `Usage:
  bun run secrets:check [--yes]
  bun run secrets:rekey [--dry-run] [--yes]
`;

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [command, ...args] = process.argv.slice(2);
if (command !== "check" && command !== "rekey") {
  process.stderr.write(USAGE);
  process.exit(1);
}

let keys: KeyPair;
try {
  const oldRaw = env.OLD_DATA_ENCRYPTION_KEY?.trim();
  keys = {
    current: loadKey(),
    old: oldRaw ? parseDataKey(oldRaw, "OLD_DATA_ENCRYPTION_KEY") : null,
  };
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

const dryRun = args.includes("--dry-run");
const action =
  command === "check"
    ? "Key check (read-only)"
    : `Rekey${dryRun ? " (dry run, no writes)" : ""}`;
if (!confirmDatabaseTarget(env.DATABASE_URL, args, action)) {
  process.exit(1);
}
process.stdout.write(
  `Current key (DATA_ENCRYPTION_KEY): fingerprint ${keyFingerprint(keys.current)}\n` +
    `Old key (OLD_DATA_ENCRYPTION_KEY): ${keys.old ? `fingerprint ${keyFingerprint(keys.old)}` : "not set"}\n\n`
);

if (command === "check") {
  const reports = await checkStoredSecrets(db, keys);
  process.stdout.write(formatReports(reports));
  if (needsAction(reports)) {
    process.stdout.write(
      keys.old
        ? "\nAction needed: run secrets:rekey for values the old key opens; values neither key opens need another candidate key.\n"
        : "\nAction needed: some values don't open with the current key; rerun with OLD_DATA_ENCRYPTION_KEY set to a candidate key.\n"
    );
    process.exit(1);
  }
  process.stdout.write("\nEvery checkable value matches the current key.\n");
  process.exit(0);
}

try {
  const reports = await rekeyStoredSecrets(db, keys, { dryRun });
  process.stdout.write(formatReports(reports));
  process.stdout.write(
    dryRun
      ? "\nDry run: nothing was written. Rerun without --dry-run to apply.\n"
      : "\nDone. Run secrets:check to confirm.\n"
  );
  process.exit(0);
} catch (error) {
  if (error instanceof RekeyRefusedError) {
    fail(error.message);
  }
  throw error;
}
