/**
 * Scripts that write to the database (`vendors:backfill-private`,
 * `secrets:rekey`, and `secrets:check`, which reads private data) say which
 * database they will use and, unless it is on this machine, need `--yes` or
 * a typed confirmation, so pointing one at production is a deliberate act.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Where a connection string points, without its credentials. */
export function describeDatabaseTarget(url: string): {
  label: string;
  local: boolean;
} {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const port = parsed.port || "5432";
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  return {
    label: `${host}:${port}/${database}`,
    local: LOCAL_HOSTS.has(host),
  };
}

export interface ConfirmIo {
  /** The answer to a question, or null when there is no terminal to ask. */
  ask: (question: string) => string | null;
  write: (text: string) => void;
}

const terminalIo: ConfirmIo = {
  ask: (question) => (process.stdin.isTTY ? prompt(question) : null),
  write: (text) => process.stdout.write(text),
};

/**
 * Prints the target and returns whether to go on: always for a local
 * database, with `--yes` in `args`, or when the person types "yes".
 */
export function confirmDatabaseTarget(
  url: string,
  args: readonly string[],
  action: string,
  io: ConfirmIo = terminalIo
): boolean {
  const target = describeDatabaseTarget(url);
  io.write(`${action}: database ${target.label}\n`);
  if (target.local || args.includes("--yes")) {
    return true;
  }
  const answer = io.ask(
    `${target.label} is not on this machine. Type "yes" to continue:`
  );
  if (answer?.trim().toLowerCase() === "yes") {
    return true;
  }
  io.write(
    answer === null
      ? "Not a local database; rerun with --yes to confirm.\n"
      : "Cancelled.\n"
  );
  return false;
}
