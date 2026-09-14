import { describe, expect, it } from "bun:test";

import { getJobDatabaseUrl } from "./database-url";

describe("job database connection", () => {
  it("disables event triggers only on the derived job connection", () => {
    const original =
      "postgres://example:encoded%40value@localhost:5432/test?sslmode=require";
    const result = new URL(getJobDatabaseUrl(original));
    expect(result.searchParams.get("options")).toBe("-c event_triggers=off");
    expect(result.searchParams.get("sslmode")).toBe("require");
    expect(result.username).toBe("example");
    expect(result.password).toBe("encoded%40value");
    expect(result.host).toBe("localhost:5432");
    expect(result.pathname).toBe("/test");
    expect(new URL(original).searchParams.has("options")).toBe(false);
  });

  it("preserves existing session settings before the job-specific override", () => {
    const url = new URL("postgres://localhost/test");
    url.searchParams.set(
      "options",
      "-c statement_timeout=5000 -c event_triggers=on"
    );
    expect(
      new URL(getJobDatabaseUrl(url.toString())).searchParams.get("options")
    ).toBe(
      "-c statement_timeout=5000 -c event_triggers=on -c event_triggers=off"
    );
  });
});
