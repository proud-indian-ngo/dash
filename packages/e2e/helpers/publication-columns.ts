import { writeSync } from "node:fs";

import { db } from "@pi-dash/db";
import { sql } from "drizzle-orm";

const rows = await db.execute(sql`
  SELECT attnames
  FROM pg_publication_tables
  WHERE pubname = 'pi_dash_public'
    AND schemaname = 'public'
    AND tablename = 'user'
`);

const attnames = rows[0]?.attnames;
writeSync(1, `${JSON.stringify(Array.isArray(attnames) ? attnames : [])}\n`);
process.exit(0);
