import { runAnalyzeCLI } from "@rocicorp/zero/analyze";
import { schema } from "../src/schema";

const missingEventId = "__zero_analyze_missing_event__";
const eventId = process.env.ZERO_ANALYZE_EVENT_ID ?? missingEventId;

const queries: ReadonlyArray<{
  args: readonly unknown[];
  name: string;
}> = [
  { args: [], name: "teamEvent.allAccessible" },
  { args: [], name: "teamEvent.public" },
  { args: [], name: "teamEvent.byCurrentUser" },
  { args: [], name: "team.all" },
  { args: [], name: "team.byCurrentUser" },
  { args: [], name: "eventInterest.allPending" },
  { args: [], name: "eventPhoto.allPending" },
  { args: [], name: "eventUpdate.allPending" },
  { args: [{ eventId }], name: "eventPhoto.pendingByEvent" },
  { args: [{ eventId }], name: "eventUpdate.pendingByEvent" },
];

const zeroCacheUrl = process.env.ZERO_CACHE_URL;

if (!zeroCacheUrl) {
  console.error("ZERO_CACHE_URL is required.");
  process.exit(1);
}

for (const query of queries) {
  console.log(`\n=== ${query.name} ===`);

  const argv = [
    "--zero-cache-url",
    zeroCacheUrl,
    "--query-name",
    query.name,
    "--query-args",
    JSON.stringify(query.args),
    "--join-plans",
  ];

  if (process.env.ZERO_ADMIN_PASSWORD) {
    argv.push("--admin-password", process.env.ZERO_ADMIN_PASSWORD);
  }

  if (process.env.COOKIE) {
    argv.push("--cookie", process.env.COOKIE);
  }

  if (process.env.ZERO_AUTH_TOKEN) {
    argv.push("--auth-token", process.env.ZERO_AUTH_TOKEN);
  }

  // Analyzer output is query-scoped, so keep runs sequential and readable.
  // biome-ignore lint/performance/noAwaitInLoops: Parallel runs interleave output.
  await runAnalyzeCLI({ argv, schema });
}
