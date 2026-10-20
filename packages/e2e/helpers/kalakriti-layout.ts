import { writeSync } from "node:fs";

import { db } from "@pi-dash/db";
import { user } from "@pi-dash/db/schema/auth";
import { kalakritiOperation } from "@pi-dash/db/schema/kalakriti";
import { eq } from "drizzle-orm";

const id = (number: number) =>
  `019f0000-0218-7000-8000-${number.toString(16).padStart(12, "0")}`;

const EDITION_ID = id(1);
const STUDENT_IDS = [21, 22, 23, 24, 25, 26].map(id);
const MEMBERSHIP_IDS = [51, 52, 53, 54].map(id);

function assertIsolatedTarget() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  const port = process.env.E2E_DB_PORT ?? "5433";
  if (
    url.hostname !== "localhost" ||
    url.port !== port ||
    url.pathname !== "/pi-dash-test"
  ) {
    throw new Error(
      `Kalakriti layout fixture requires localhost:${port}/pi-dash-test`
    );
  }
}

async function populate(superAdminEmail: string) {
  const actor = await db.query.user.findFirst({
    columns: { id: true },
    where: eq(user.email, superAdminEmail),
  });
  if (!actor) {
    throw new Error("Kalakriti layout fixture requires the seeded super admin");
  }

  const now = new Date();
  const operations = [
    ...STUDENT_IDS.map((studentId, index) => ({
      id: id(200 + index),
      operationId: id(220 + index),
      studentId,
      type: "pickup" as const,
    })),
    ...MEMBERSHIP_IDS.map((membershipId, index) => ({
      id: id(210 + index),
      membershipId,
      operationId: id(230 + index),
      type: "volunteer_check_in" as const,
    })),
  ];
  await db
    .insert(kalakritiOperation)
    .values(
      operations.map((operation) => ({
        ...operation,
        createdAt: now,
        editionId: EDITION_ID,
        occurredAt: now,
        recordedBy: actor.id,
      }))
    )
    .onConflictDoNothing();

  return { eligible: operations.length };
}

assertIsolatedTarget();
const [action, superAdminEmail] = process.argv.slice(2);
try {
  if (action !== "populate" || !superAdminEmail) {
    throw new Error("Usage: kalakriti-layout.ts populate <super-admin-email>");
  }
  writeSync(1, `${JSON.stringify(await populate(superAdminEmail))}\n`);
} finally {
  await db.$client.end();
}
