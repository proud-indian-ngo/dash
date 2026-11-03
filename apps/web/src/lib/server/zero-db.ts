import { db } from "@pi-dash/db";
import { schema } from "@pi-dash/zero/schema";
import { zeroDrizzle } from "@rocicorp/zero/server/adapters/drizzle";

// Runs ZQL on the server for reads whose rows must not sync to the client.
export const zeroDb = zeroDrizzle(schema, db);
