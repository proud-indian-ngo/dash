import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { expect, test } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
const helperPath = path.resolve(
  import.meta.dirname,
  "../../helpers/kalakriti-release-races.ts"
);

async function fixture<T>(action: "cleanup" | "run", actorEmail?: string) {
  const { stdout } = await execFileAsync(
    "bun",
    ["run", helperPath, action, ...(actorEmail ? [actorEmail] : [])],
    { env: process.env }
  );
  return JSON.parse(stdout.trim()) as T;
}

test("serializes live Edition, duplicate Membership, and duplicate Entry races", async ({
  superAdminEmail,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "kalakriti_release_invariants",
    "Authoritative PostgreSQL release races"
  );
  test.slow();

  try {
    const result = await fixture<{
      entries: {
        entryCount: number;
        memberCount: number;
        successfulWrites: number;
      };
      live: { liveCount: number; successfulWrites: number };
      membership: { membershipCount: number; successfulWrites: number };
      projections: Array<{
        dashboard: {
          entries: number;
          participants: number;
          registeredStudents: number;
          students: number;
        };
        export: {
          entries: number;
          participants: number;
          students: number;
        };
        kind: string;
      }>;
    }>("run", superAdminEmail);
    expect(result.membership).toEqual({
      membershipCount: 1,
      successfulWrites: 1,
    });
    expect(result.entries).toEqual({
      entryCount: 1,
      memberCount: 1,
      successfulWrites: 1,
    });
    expect(result.live.liveCount).toBe(1);
    expect(result.live.successfulWrites).toBe(1);
    expect(result.projections).toEqual([
      {
        dashboard: expect.objectContaining({
          entries: 2,
          participants: 2,
          registeredStudents: 2,
          students: 3,
        }),
        export: { entries: 2, participants: 2, students: 3 },
        kind: "edition",
      },
      {
        dashboard: expect.objectContaining({
          entries: 1,
          participants: 1,
          registeredStudents: 1,
          students: 1,
        }),
        export: { entries: 1, participants: 1, students: 1 },
        kind: "center",
      },
      ...["competition_category", "competition"].map((kind) => ({
        dashboard: expect.objectContaining({
          entries: 2,
          participants: 2,
          registeredStudents: 2,
          students: 2,
        }),
        export: { entries: 2, participants: 2, students: 2 },
        kind,
      })),
    ]);
  } finally {
    await fixture("cleanup");
  }
});
