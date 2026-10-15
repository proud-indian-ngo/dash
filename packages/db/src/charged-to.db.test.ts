import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PROGRAMME_IDS } from "@pi-dash/shared/constants";
import { SQL, type TransactionSQL } from "bun";
import { uuidv7 } from "uuidv7";
import { expect, it } from "vitest";

/**
 * Database-backed checks of "Charged to" on expenses: the backfill migration
 * on fixture rows, and the checks and the project-belongs-to-programme
 * foreign key on the real tables. Opt in with CHARGED_TO_TEST_DATABASE_URL
 * pointing at a local, migrated and seeded database (a worktree's isolated
 * database). Everything runs in a transaction that is rolled back.
 */

const databaseUrl = process.env.CHARGED_TO_TEST_DATABASE_URL;
const localDatabase =
  databaseUrl !== undefined &&
  /^postgres(?:ql)?:\/\/[^/]*@(localhost|127\.0\.0\.1|\[::1\]):\d+\//.test(
    databaseUrl
  );

class Rollback extends Error {}

async function inRolledBackTransaction(
  run: (sql: TransactionSQL) => Promise<void>
): Promise<void> {
  const client = new SQL(databaseUrl as string, { max: 1 });
  try {
    await client.begin(async (sql) => {
      await run(sql);
      throw new Rollback();
    });
  } catch (error) {
    if (!(error instanceof Rollback)) {
      throw error;
    }
  } finally {
    await client.close();
  }
}

function migrationStatements(file: string): string[] {
  return readFileSync(join(import.meta.dirname, "migrations", file), "utf8")
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

const singleTeamStatements = migrationStatements(
  "0140_charged_to_single_team.sql"
);

const backfillStatements = readFileSync(
  join(import.meta.dirname, "migrations/0138_backfill_charged_to.sql"),
  "utf8"
)
  .split("--> statement-breakpoint")
  .map((statement) => statement.trim())
  .filter(Boolean);

it.skipIf(!localDatabase)(
  "backfills event, Unallocated and leaves set rows alone",
  async () => {
    await inRolledBackTransaction(async (sql) => {
      // Temporary tables shadow the real ones for the migration's
      // unqualified names, so the fixture rows never touch real data.
      for (const table of ["reimbursement", "vendor_payment"]) {
        await sql.unsafe(
          `CREATE TEMP TABLE ${table} (id text PRIMARY KEY, event_id uuid, charged_to text, charged_programme_id uuid) ON COMMIT DROP`
        );
        await sql.unsafe(
          `INSERT INTO ${table} VALUES
            ('with-event', '${uuidv7()}', NULL, NULL),
            ('no-event', NULL, NULL, NULL),
            ('already-set', NULL, 'organisation', NULL)`
        );
      }
      for (const _run of [1, 2]) {
        for (const statement of backfillStatements) {
          await sql.unsafe(statement);
        }
      }
      for (const table of ["reimbursement", "vendor_payment"]) {
        const rows = (await sql.unsafe(
          `SELECT id, charged_to, charged_programme_id FROM ${table} ORDER BY id`
        )) as {
          charged_programme_id: string | null;
          charged_to: string;
          id: string;
        }[];
        // Bun's result rows are an array subclass; compare plain objects.
        expect(rows.map((row) => ({ ...row }))).toEqual([
          {
            charged_programme_id: null,
            charged_to: "organisation",
            id: "already-set",
          },
          {
            charged_programme_id: PROGRAMME_IDS.unallocated,
            charged_to: "programme",
            id: "no-event",
          },
          { charged_programme_id: null, charged_to: "event", id: "with-event" },
        ]);
      }
    });
  }
);

it.skipIf(!localDatabase)(
  "enforces the charge rules and the project's programme",
  async () => {
    await inRolledBackTransaction(async (sql) => {
      const [owner] = (await sql`SELECT id FROM "user" LIMIT 1`) as {
        id: string;
      }[];
      if (!owner) {
        throw new Error("Seed the test database first");
      }
      const [event] = (await sql`SELECT id FROM team_event LIMIT 1`) as {
        id: string;
      }[];
      const projectId = uuidv7();
      await sql`INSERT INTO project (id, code, name, programme_id, created_at, updated_at)
        VALUES (${projectId}, ${`CT-${projectId}`}, 'Charged-to test class', ${PROGRAMME_IDS.education}, now(), now())`;

      const insert = (values: {
        chargedProgrammeId?: string | null;
        chargedProjectId?: string | null;
        chargedTo: string;
        eventId?: string | null;
      }) =>
        sql.savepoint(
          (sp) => sp`INSERT INTO reimbursement
            (id, title, expense_date, created_at, updated_at, user_id, charged_to, charged_programme_id, charged_project_id, event_id)
            VALUES (${uuidv7()}, 'Charged-to test', '2026-09-01', now(), now(), ${owner.id},
              ${values.chargedTo}::expense_charged_to, ${values.chargedProgrammeId ?? null}, ${values.chargedProjectId ?? null}, ${values.eventId ?? null})`
        );

      await expect(insert({ chargedTo: "event" })).rejects.toThrow(
        "reimbursement_charged_to_chk"
      );
      await expect(insert({ chargedTo: "programme" })).rejects.toThrow(
        "reimbursement_charged_to_chk"
      );
      await expect(
        insert({
          chargedProgrammeId: PROGRAMME_IDS.education,
          chargedTo: "organisation",
        })
      ).rejects.toThrow("reimbursement_charged_to_chk");
      await expect(
        insert({
          chargedProgrammeId: PROGRAMME_IDS.artsAndCulture,
          chargedProjectId: projectId,
          chargedTo: "programme",
        })
      ).rejects.toThrow("reimbursement_charged_project_programme_fk");

      if (event) {
        // A programme or admin charge keeps no event.
        await expect(
          insert({
            chargedProgrammeId: PROGRAMME_IDS.education,
            chargedTo: "programme",
            eventId: event.id,
          })
        ).rejects.toThrow("reimbursement_charged_to_chk");
        await expect(
          insert({ chargedTo: "organisation", eventId: event.id })
        ).rejects.toThrow("reimbursement_charged_to_chk");
      }

      await insert({
        chargedProgrammeId: PROGRAMME_IDS.education,
        chargedProjectId: projectId,
        chargedTo: "programme",
      });
      await insert({ chargedTo: "organisation" });
      if (event) {
        await insert({ chargedTo: "event", eventId: event.id });
      }
    });
  }
);

it.skipIf(!localDatabase)(
  "moves Unallocated rows to the submitter's only team's programme",
  async () => {
    await inRolledBackTransaction(async (sql) => {
      const unallocated = PROGRAMME_IDS.unallocated;
      const education = PROGRAMME_IDS.education;
      const arts = PROGRAMME_IDS.artsAndCulture;
      await sql.unsafe(
        "CREATE TEMP TABLE team (id text PRIMARY KEY, programme_id uuid) ON COMMIT DROP"
      );
      await sql.unsafe(
        "CREATE TEMP TABLE team_member (team_id text, user_id text) ON COMMIT DROP"
      );
      await sql.unsafe(`INSERT INTO team VALUES
        ('edu', '${education}'), ('arts', '${arts}'),
        ('holding', '${unallocated}'), ('none', NULL)`);
      await sql.unsafe(`INSERT INTO team_member VALUES
        ('edu', 'one-team'),
        ('edu', 'two-teams'), ('arts', 'two-teams'),
        ('holding', 'holding-team'), ('none', 'no-programme')`);
      for (const table of ["reimbursement", "vendor_payment"]) {
        await sql.unsafe(
          `CREATE TEMP TABLE ${table} (id text PRIMARY KEY, user_id text, event_id uuid, charged_to text, charged_programme_id uuid, charged_project_id uuid) ON COMMIT DROP`
        );
        await sql.unsafe(`INSERT INTO ${table} VALUES
          ('one-team', 'one-team', NULL, 'programme', '${unallocated}', NULL),
          ('two-teams', 'two-teams', NULL, 'programme', '${unallocated}', NULL),
          ('holding-team', 'holding-team', NULL, 'programme', '${unallocated}', NULL),
          ('no-programme', 'no-programme', NULL, 'programme', '${unallocated}', NULL),
          ('no-team', 'nobody', NULL, 'programme', '${unallocated}', NULL),
          ('chosen', 'one-team', NULL, 'programme', '${arts}', NULL),
          ('admin', 'one-team', NULL, 'organisation', NULL, NULL)`);
      }
      for (const _run of [1, 2]) {
        for (const statement of singleTeamStatements) {
          await sql.unsafe(statement);
        }
      }
      for (const table of ["reimbursement", "vendor_payment"]) {
        const rows = (await sql.unsafe(
          `SELECT id, charged_programme_id FROM ${table} ORDER BY id`
        )) as { charged_programme_id: string | null; id: string }[];
        expect(
          Object.fromEntries(rows.map((r) => [r.id, r.charged_programme_id]))
        ).toEqual({
          admin: null,
          chosen: arts,
          "holding-team": unallocated,
          "no-programme": unallocated,
          "no-team": unallocated,
          "one-team": education,
          "two-teams": unallocated,
        });
      }
    });
  }
);
