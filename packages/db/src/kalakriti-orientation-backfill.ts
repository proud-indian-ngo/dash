import type { drizzle } from "drizzle-orm/bun-sql";

import {
  kalakritiOrientationEligibility,
  promoteKalakritiVolunteer,
} from "./kalakriti-orientation";
import { user } from "./schema/auth";

export function parseBackfillTarget(
  databaseUrl: string,
  args: readonly string[]
) {
  const url = new URL(databaseUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }
  if (
    [...url.searchParams.keys()].some((key) =>
      ["host", "hostaddr", "port", "dbname", "service"].includes(
        key.toLowerCase()
      )
    )
  ) {
    throw new Error(
      "Connection-routing query parameters are not allowed; specify the target in the URL authority and path"
    );
  }
  const target = `${url.hostname}:${url.port || "5432"}${url.pathname}`;
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const apply = args.includes("--apply");
  const confirm = args
    .find((arg) => arg.startsWith("--confirm-target="))
    ?.slice("--confirm-target=".length);
  const unknown = args.filter(
    (arg) =>
      !["--apply", "--dry-run"].includes(arg) &&
      !arg.startsWith("--confirm-target=")
  );
  if (unknown.length || (apply && args.includes("--dry-run"))) {
    throw new Error(
      "Use --dry-run (default) or --apply, with optional --confirm-target=host:port/database"
    );
  }
  if (!local && confirm !== target) {
    throw new Error(
      `Remote database refused. Explicit target confirmation required: --confirm-target=${target}`
    );
  }
  return { apply, local, target };
}

export async function backfillKalakritiOrientation(
  database: Pick<ReturnType<typeof drizzle>, "transaction">,
  options: { apply: boolean; now: number }
) {
  return await database.transaction(async (tx) => {
    const candidates = await tx
      .select({ id: user.id })
      .from(user)
      .where(kalakritiOrientationEligibility(tx))
      .orderBy(user.id);
    const promotedUserIds: string[] = [];
    if (options.apply) {
      for (const candidate of candidates) {
        if (await promoteKalakritiVolunteer(tx, candidate.id, options.now)) {
          promotedUserIds.push(candidate.id);
        }
      }
    }
    return { candidates: candidates.length, promotedUserIds };
  });
}
