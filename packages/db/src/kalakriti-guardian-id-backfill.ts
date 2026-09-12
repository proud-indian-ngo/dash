import { parseBackfillTarget } from "./kalakriti-orientation-backfill";

export function parseGuardianIdBackfillOptions(
  databaseUrl: string,
  args: readonly string[]
) {
  const editions = args.filter((arg) => arg.startsWith("--edition-id="));
  const editionId = editions[0]?.slice("--edition-id=".length);
  if (
    editions.length !== 1 ||
    !editionId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      editionId
    )
  ) {
    throw new Error("Exactly one --edition-id=<Edition UUID> is required");
  }
  const options = parseBackfillTarget(
    databaseUrl,
    args.filter((arg) => !arg.startsWith("--edition-id="))
  );
  if (options.apply && !args.includes(`--confirm-target=${options.target}`)) {
    throw new Error(
      `Apply requires explicit target confirmation: --confirm-target=${options.target}`
    );
  }
  return { ...options, editionId };
}
