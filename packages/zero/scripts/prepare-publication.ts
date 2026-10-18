import { SQL } from "bun";

import { prepareZeroPublication } from "./publication";

const databaseUrl = process.env.ZERO_UPSTREAM_DB ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("ZERO_UPSTREAM_DB or DATABASE_URL is required");
}

const sql = new SQL(databaseUrl, { max: 1 });
try {
  await prepareZeroPublication(sql);
  process.stdout.write(
    "Zero publication is restricted to the synced schema.\n"
  );
} finally {
  await sql.close();
}
