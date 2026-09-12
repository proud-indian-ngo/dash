import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";

it("locks the Edition before the shared Guardian creation funnel inserts an FK child", () => {
  const source = readFileSync(
    new URL("../apps/web/src/functions/kalakriti-guardian.ts", import.meta.url),
    "utf8"
  );
  const start = source.indexOf(
    "async function insertGuardianMembershipRecords("
  );
  const end = source.indexOf("type GuardianInviteData", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const funnel = source.slice(start, end);
  const parent = funnel.indexOf(".from(kalakritiEdition)");
  const lock = funnel.indexOf('.for("update")', parent);
  const insert = funnel.indexOf("await tx.insert(kalakritiEditionMembership)");
  const allocate = funnel.indexOf(
    "await ensureKalakritiGuardianHumanId(tx, editionId, membershipId)"
  );
  expect(parent).toBeGreaterThan(-1);
  expect(lock).toBeGreaterThan(parent);
  expect(insert).toBeGreaterThan(lock);
  expect(allocate).toBeGreaterThan(insert);
  // All existing invite/reuse/reactivation paths share this single child insert.
  expect(source.match(/\.insert\(kalakritiEditionMembership\)/g)).toHaveLength(
    1
  );
});
