import { describe, expect, it } from "vitest";

import {
  type ConfirmIo,
  confirmDatabaseTarget,
  describeDatabaseTarget,
} from "./database-target";

function io(answer: string | null) {
  const written: string[] = [];
  const asked: string[] = [];
  const fake: ConfirmIo = {
    ask: (question) => {
      asked.push(question);
      return answer;
    },
    write: (text) => written.push(text),
  };
  return { asked, fake, written };
}

const LOCAL = "postgres://user:secret@localhost:5433/pi_dash";
const REMOTE = "postgres://user:secret@db.example.org/pi_dash";

describe("database target guard", () => {
  it("labels the target without credentials", () => {
    expect(describeDatabaseTarget(LOCAL)).toEqual({
      label: "localhost:5433/pi_dash",
      local: true,
    });
    expect(describeDatabaseTarget(REMOTE)).toEqual({
      label: "db.example.org:5432/pi_dash",
      local: false,
    });
    expect(describeDatabaseTarget("postgres://u:p@127.0.0.1/x").local).toBe(
      true
    );
    expect(describeDatabaseTarget("postgres://u:p@[::1]/x").local).toBe(true);
  });

  it("goes ahead on a local database without asking", () => {
    const t = io(null);
    expect(confirmDatabaseTarget(LOCAL, [], "Backfill", t.fake)).toBe(true);
    expect(t.asked).toEqual([]);
    expect(t.written.join("")).not.toContain("secret");
  });

  it("refuses a remote database without a terminal or --yes", () => {
    const t = io(null);
    expect(confirmDatabaseTarget(REMOTE, [], "Backfill", t.fake)).toBe(false);
    expect(t.written.join("")).toContain("--yes");
  });

  it("goes ahead on a remote database with --yes or a typed yes", () => {
    expect(
      confirmDatabaseTarget(REMOTE, ["--yes"], "Backfill", io(null).fake)
    ).toBe(true);
    expect(
      confirmDatabaseTarget(REMOTE, [], "Backfill", io(" YES ").fake)
    ).toBe(true);
    expect(confirmDatabaseTarget(REMOTE, [], "Backfill", io("y").fake)).toBe(
      false
    );
  });
});
