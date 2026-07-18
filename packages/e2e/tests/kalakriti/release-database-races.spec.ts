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
    testInfo.project.name !== "super_admin",
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
    expect(result.live.successfulWrites).toBeLessThanOrEqual(1);
  } finally {
    await fixture("cleanup");
  }
});
