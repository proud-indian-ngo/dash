import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { promoteKalakritiVolunteer } from "./kalakriti-orientation";
import {
  backfillKalakritiOrientation,
  parseBackfillTarget,
} from "./kalakriti-orientation-backfill";

const LOCAL_DATABASE_URL =
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//;

describe("backfill target safety", () => {
  it("defaults to dry-run and never exposes credentials", () => {
    expect(
      parseBackfillTarget("postgres://test:secret@localhost:5432/test", [])
    ).toEqual({
      apply: false,
      local: true,
      target: "localhost:5432/test",
    });
  });

  it("requires the exact remote target even for a dry-run", () => {
    const url = "postgres://test:secret@production.example/test";
    expect(() => parseBackfillTarget(url, ["--apply"])).toThrow(
      "Remote database refused"
    );
    expect(() =>
      parseBackfillTarget(url, [
        "--confirm-target=production.example:5432/other",
      ])
    ).toThrow();
    expect(
      parseBackfillTarget(url, [
        "--apply",
        "--confirm-target=production.example:5432/test",
      ]).apply
    ).toBe(true);
  });

  it("rejects ambiguous modes and unknown options", () => {
    const url = "postgres://test@localhost/test";
    expect(() => parseBackfillTarget(url, ["--apply", "--dry-run"])).toThrow();
    expect(() => parseBackfillTarget(url, ["--force"])).toThrow();
    expect(() => parseBackfillTarget("https://localhost/test", [])).toThrow();
    expect(() =>
      parseBackfillTarget(`${url}?host=production.example`, ["--apply"])
    ).toThrow("Connection-routing");
  });
});

// Opt-in integration tests use connection-local temporary tables, never product rows.
const databaseUrl = process.env.KALAKRITI_ORIENTATION_TEST_DATABASE_URL;
const integration =
  databaseUrl && LOCAL_DATABASE_URL.test(databaseUrl)
    ? describe
    : describe.skip;

integration("Kalakriti orientation PostgreSQL transaction", () => {
  let client: SQL;
  let database: ReturnType<typeof drizzle>;

  beforeAll(async () => {
    client = new SQL(databaseUrl!, { max: 1 });
    database = drizzle({ client });
    await database.execute(
      sql`create temporary table "user" (id text primary key, role text, updated_at timestamp)`
    );
    await database.execute(
      sql`create temporary table session (id text primary key, user_id text)`
    );
    await database.execute(
      sql`create temporary table kalakriti_external_identity (user_id text primary key)`
    );
    await database.execute(
      sql`create temporary table kalakriti_edition (id text primary key, lifecycle text)`
    );
    await database.execute(
      sql`create temporary table kalakriti_edition_membership (id text primary key, user_id text, edition_id text, kind text, state text)`
    );
  });

  afterAll(async () => {
    await client?.close();
  });

  beforeEach(async () => {
    await database.execute(
      sql`truncate pg_temp."user", pg_temp.session, pg_temp.kalakriti_external_identity, pg_temp.kalakriti_edition, pg_temp.kalakriti_edition_membership`
    );
    await database.execute(
      sql`insert into pg_temp.kalakriti_edition values ('current', 'draft'), ('old', 'archived')`
    );
    await database.execute(sql`insert into pg_temp."user" (id,role) values
      ('eligible','unoriented_volunteer'), ('admin','admin'), ('custom','custom_role'),
      ('volunteer','volunteer'), ('external','unoriented_volunteer'), ('guardian','unoriented_volunteer'),
      ('historical','unoriented_volunteer'), ('removed','unoriented_volunteer'), ('pending','unoriented_volunteer')`);
    await database.execute(
      sql`insert into pg_temp.kalakriti_external_identity values ('external')`
    );
    await database.execute(sql`insert into pg_temp.kalakriti_edition_membership values
      ('m1','eligible','current','volunteer','active'), ('m2','admin','current','volunteer','active'),
      ('m3','custom','current','volunteer','active'), ('m4','volunteer','current','volunteer','active'),
      ('m5','external','current','volunteer','active'), ('m6','guardian','current','guardian','active'),
      ('m7','historical','old','volunteer','active'), ('m8','removed','current','volunteer','archived'),
      ('m9',null,'current','volunteer','active')`);
    await database.execute(
      sql`insert into pg_temp.session values ('s1','eligible'), ('s2','admin')`
    );
  });

  it("dry-runs, applies only eligible memberships, and replays without writes", async () => {
    expect(
      await backfillKalakritiOrientation(database, { apply: false, now: 1 })
    ).toEqual({ candidates: 1, promotedUserIds: [] });
    expect(
      await backfillKalakritiOrientation(database, { apply: true, now: 1 })
    ).toEqual({ candidates: 1, promotedUserIds: ["eligible"] });
    expect(
      await backfillKalakritiOrientation(database, { apply: true, now: 2 })
    ).toEqual({ candidates: 0, promotedUserIds: [] });
    const rows = await database.execute(
      sql`select id,role from pg_temp."user" order by id`
    );
    expect(Array.from(rows)).toEqual([
      { id: "admin", role: "admin" },
      { id: "custom", role: "custom_role" },
      { id: "eligible", role: "volunteer" },
      { id: "external", role: "unoriented_volunteer" },
      { id: "guardian", role: "unoriented_volunteer" },
      { id: "historical", role: "unoriented_volunteer" },
      { id: "pending", role: "unoriented_volunteer" },
      { id: "removed", role: "unoriented_volunteer" },
      { id: "volunteer", role: "volunteer" },
    ]);
    expect(
      Array.from(await database.execute(sql`select id from pg_temp.session`))
    ).toEqual([{ id: "s2" }]);
  });

  it("rolls back role and session revocation on later enrollment failure", async () => {
    await expect(
      database.transaction(async (tx) => {
        expect(await promoteKalakritiVolunteer(tx, "eligible", 1)).toBe(true);
        throw new Error("assignment failed");
      })
    ).rejects.toThrow("assignment failed");
    expect(
      Array.from(
        await database.execute(
          sql`select role from pg_temp."user" where id='eligible'`
        )
      )
    ).toEqual([{ role: "unoriented_volunteer" }]);
    expect(
      Array.from(
        await database.execute(
          sql`select id from pg_temp.session where user_id='eligible'`
        )
      )
    ).toEqual([{ id: "s1" }]);
  });

  it("does not overwrite an intervening custom role and handles reactivation", async () => {
    await database.transaction(async (tx) => {
      await tx.execute(
        sql`update pg_temp."user" set role='custom_role' where id='eligible'`
      );
      expect(await promoteKalakritiVolunteer(tx, "eligible", 1)).toBe(false);
      expect(await promoteKalakritiVolunteer(tx, "removed", 1)).toBe(false);
      await tx.execute(
        sql`update pg_temp.kalakriti_edition_membership set state='active' where user_id='removed'`
      );
      expect(await promoteKalakritiVolunteer(tx, "removed", 1)).toBe(true);
      expect(await promoteKalakritiVolunteer(tx, "removed", 1)).toBe(false);
    });
  });
});
