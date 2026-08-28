import { db } from "@pi-dash/db";
import {
  kalakritiCenter,
  kalakritiEdition,
} from "@pi-dash/db/schema/kalakriti";
import { eq } from "drizzle-orm";
import { KALAKRITI_RELEASE_FIXTURE_IDS } from "./kalakriti-release-fixture";

const fixture = KALAKRITI_RELEASE_FIXTURE_IDS;
const GOLIVE_YEAR = 2190;

export async function prepareKalakriti2186EventDay() {
  const now = new Date();
  await db
    .update(kalakritiCenter)
    .set({
      competitionEntryRegistrationEnabled: false,
      studentRegistrationEnabled: false,
      updatedAt: now,
    })
    .where(eq(kalakritiCenter.editionId, fixture.editionId));
  await db
    .update(kalakritiEdition)
    .set({ lifecycle: "live", updatedAt: now })
    .where(eq(kalakritiEdition.id, fixture.editionId));
  return { year: 2186 };
}

export async function lockKalakriti2186ForGoLive() {
  const now = new Date();
  await db
    .update(kalakritiCenter)
    .set({
      competitionEntryRegistrationEnabled: false,
      studentRegistrationEnabled: false,
      updatedAt: now,
    })
    .where(eq(kalakritiCenter.editionId, fixture.editionId));
  await db
    .update(kalakritiEdition)
    .set({ lifecycle: "registration_locked", updatedAt: now })
    .where(eq(kalakritiEdition.id, fixture.editionId));
  return { year: 2186 };
}

export async function invalidateKalakriti2186GoLive() {
  const now = new Date();
  await db
    .update(kalakritiCenter)
    .set({
      competitionEntryRegistrationEnabled: true,
      studentRegistrationEnabled: false,
      updatedAt: now,
    })
    .where(eq(kalakritiCenter.id, fixture.centerAssignedId));
  await db
    .update(kalakritiEdition)
    .set({ lifecycle: "registration_locked", updatedAt: now })
    .where(eq(kalakritiEdition.id, fixture.editionId));
  return { year: 2186 };
}

export async function resetKalakriti2186RegistrationOpen() {
  const now = new Date();
  await db
    .update(kalakritiEdition)
    .set({ lifecycle: "registration_open", updatedAt: now })
    .where(eq(kalakritiEdition.id, fixture.editionId));
  return { year: 2186 };
}

const [action] = process.argv.slice(2);
try {
  let result:
    | Awaited<ReturnType<typeof prepareKalakriti2186EventDay>>
    | Awaited<ReturnType<typeof lockKalakriti2186ForGoLive>>
    | Awaited<ReturnType<typeof invalidateKalakriti2186GoLive>>
    | Awaited<ReturnType<typeof resetKalakriti2186RegistrationOpen>>;
  if (action === "prepare-2186-event-day") {
    result = await prepareKalakriti2186EventDay();
  } else if (action === "lock-2186") {
    result = await lockKalakriti2186ForGoLive();
  } else if (action === "invalidate-go-live") {
    result = await invalidateKalakriti2186GoLive();
  } else if (action === "reset-2186-registration-open") {
    result = await resetKalakriti2186RegistrationOpen();
  } else {
    throw new Error(`Unknown action: ${action}`);
  }
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
} catch (error) {
  process.stderr.write(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

export { GOLIVE_YEAR };
