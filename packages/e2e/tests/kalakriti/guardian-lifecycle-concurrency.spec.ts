import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "../../fixtures/test";
import { KalakritiGuardiansPage } from "../../pages/kalakriti-guardians-page";

const GUARDIAN_EMAIL = "guardian-race@pi-dash.test";
const GUARDIAN_NAME = "Guardian Race Test";
const ORPHAN_NAME = "Orphaned Central Guardian";
const EDITION_IDS = [
  "019f0000-0000-7000-8000-00000000e521",
  "019f0000-0000-7000-8000-00000000e522",
] as const;
const YEARS = [2198, 2199] as const;

interface RaceMembership {
  editionId: string;
  id: string;
  state: "active" | "archived";
}

interface RaceState {
  activeMemberships: RaceMembership[];
  banned: boolean | null;
  centerAssignmentCount: number;
  memberships: RaceMembership[];
  sessionCount: number;
}

interface MembershipState {
  state: "active" | "archived";
  userId: string | null;
}

const execFileAsync = promisify(execFile);
test.describe.configure({ mode: "serial" });
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-guardian-race.ts"
);

async function runRaceHelper<T>(action: string, argument?: string): Promise<T> {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(argument ? [argument] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

test("serializes concurrent Guardian reactivation and archival", async ({
  context,
  page,
  superAdminEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Super-administrator concurrency test"
  );
  test.slow();

  const { userId } = await runRaceHelper<{ userId: string }>(
    "setup",
    superAdminEmail
  );
  const otherPage = await context.newPage();
  const firstGuardians = new KalakritiGuardiansPage(page);
  const secondGuardians = new KalakritiGuardiansPage(otherPage);

  try {
    await Promise.all([
      firstGuardians.goto(YEARS[0]),
      secondGuardians.goto(YEARS[1]),
    ]);
    await Promise.all([
      firstGuardians.requestDormantIdentityReuse({
        email: GUARDIAN_EMAIL,
        name: GUARDIAN_NAME,
      }),
      secondGuardians.requestDormantIdentityReuse({
        email: GUARDIAN_EMAIL,
        name: GUARDIAN_NAME,
      }),
    ]);
    await Promise.all([
      firstGuardians.confirmReuse(),
      secondGuardians.confirmReuse(),
    ]);

    await expect
      .poll(async () => {
        const state = await runRaceHelper<RaceState>("state", userId);
        return state.activeMemberships.length;
      })
      .toBe(1);

    const activeState = await runRaceHelper<RaceState>("state", userId);
    const [activeMembership] = activeState.activeMemberships;
    expect(activeMembership).toBeDefined();
    const winningIndex = EDITION_IDS.indexOf(
      activeMembership?.editionId as (typeof EDITION_IDS)[number]
    );
    expect(winningIndex).toBeGreaterThanOrEqual(0);

    expect(activeState.banned).toBe(false);
    await runRaceHelper("assign-center", activeMembership?.id);
    await runRaceHelper("create-session", userId);

    await expect
      .poll(async () => {
        const state = await runRaceHelper<RaceState>("state", userId);
        return state.centerAssignmentCount;
      })
      .toBe(1);

    await Promise.all([
      firstGuardians.goto(YEARS[winningIndex] as number),
      secondGuardians.goto(YEARS[winningIndex] as number),
    ]);
    await Promise.all([
      firstGuardians.requestArchive(GUARDIAN_NAME),
      secondGuardians.requestArchive(GUARDIAN_NAME),
    ]);
    await Promise.all([
      firstGuardians.confirmArchive(),
      secondGuardians.confirmArchive(),
    ]);

    await expect
      .poll(async () => {
        const state = await runRaceHelper<RaceState>("state", userId);
        const membership = state.memberships.find(
          (candidate) => candidate.id === activeMembership?.id
        );
        return {
          banned: state.banned,
          centerAssignmentCount: state.centerAssignmentCount,
          sessionCount: state.sessionCount,
          state: membership?.state,
        };
      })
      .toEqual({
        banned: true,
        centerAssignmentCount: 0,
        sessionCount: 0,
        state: "archived",
      });
  } finally {
    await otherPage.close();
    await runRaceHelper("cleanup");
  }
});

test("archives a Guardian membership after its central user is deleted", async ({
  page,
  superAdminEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Super-administrator orphaned membership test"
  );

  const { membershipId } = await runRaceHelper<{ membershipId: string }>(
    "setup-orphan",
    superAdminEmail
  );
  const guardians = new KalakritiGuardiansPage(page);

  try {
    await guardians.goto(YEARS[0]);
    await guardians.requestArchive(ORPHAN_NAME);
    await guardians.confirmArchive();

    await expect
      .poll(() =>
        runRaceHelper<MembershipState>("membership-state", membershipId)
      )
      .toEqual({ state: "archived", userId: null });
  } finally {
    await runRaceHelper("cleanup");
  }
});
