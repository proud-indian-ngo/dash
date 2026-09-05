import { writeSync } from "node:fs";

import { db } from "@pi-dash/db";
import {
  kalakritiEdition,
  kalakritiEditionMembership,
} from "@pi-dash/db/schema/kalakriti";
import { and, eq } from "drizzle-orm";

try {
  const [membership] = await db
    .select({
      humanId: kalakritiEditionMembership.humanId,
      id: kalakritiEditionMembership.id,
    })
    .from(kalakritiEditionMembership)
    .innerJoin(
      kalakritiEdition,
      eq(kalakritiEdition.id, kalakritiEditionMembership.editionId)
    )
    .where(
      and(
        eq(kalakritiEdition.year, 2186),
        eq(kalakritiEditionMembership.snapshotName, "volunteerCoordinator"),
        eq(kalakritiEditionMembership.kind, "volunteer"),
        eq(kalakritiEditionMembership.state, "active")
      )
    );
  if (!membership) {
    throw new Error("Station volunteer fixture is missing");
  }
  writeSync(1, JSON.stringify(membership));
} finally {
  await db.$client.end();
}
