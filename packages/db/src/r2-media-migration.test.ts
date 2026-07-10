import { describe, expect, it } from "vitest";
import {
  type MediaMigrationChange,
  type MediaMigrationRepository,
  type MediaMigrationRow,
  type MediaMigrationTable,
  parseMediaMigrationArgs,
  runR2MediaUrlMigration,
} from "./r2-media-migration";

const CDN = "https://cdn.example.test";

class FakeRepository implements MediaMigrationRepository {
  readonly appliedBatches: Array<{
    changes: MediaMigrationChange[];
    table: MediaMigrationTable;
  }> = [];
  readonly rows: Record<MediaMigrationTable, MediaMigrationRow[]>;

  constructor(rows: Record<MediaMigrationTable, MediaMigrationRow[]>) {
    this.rows = rows;
  }

  applyBatch(
    table: MediaMigrationTable,
    changes: MediaMigrationChange[]
  ): Promise<void> {
    this.appliedBatches.push({ changes, table });
    for (const change of changes) {
      const row = this.rows[table].find(
        (candidate) => candidate.id === change.id
      );
      if (!row || row.value !== change.before) {
        return Promise.reject(new Error("stale row"));
      }
      row.value = change.after;
    }
    return Promise.resolve();
  }

  readBatch(
    table: MediaMigrationTable,
    afterId: null | string,
    limit: number
  ): Promise<MediaMigrationRow[]> {
    return Promise.resolve(
      this.rows[table]
        .filter((row) => afterId === null || row.id > afterId)
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, limit)
        .map((row) => ({ ...row }))
    );
  }
}

const plate = (...urls: string[]) =>
  JSON.stringify(
    urls.map((url) => ({ children: [{ text: "" }], type: "img", url }))
  );

const fixture = () =>
  new FakeRepository({
    eventFeedback: [
      {
        eventId: "event-2",
        id: "f0",
        value: plate(`${CDN}/app/updates/event-2/feedback.jpg`),
      },
      {
        eventId: "event-2",
        id: "f1",
        value: "{malformed",
      },
    ],
    eventUpdate: [
      {
        eventId: "event-1",
        id: "e1",
        value: plate(
          `${CDN}/app/updates/event-1/old.jpg`,
          "/api/media/event-update?eventId=event-1&key=app%2Fupdates%2Fevent-1%2Fnew.jpg",
          "https://images.example.org/external.jpg"
        ),
      },
    ],
    user: [
      {
        id: "u0",
        value: "",
      },
      {
        id: "u1",
        value: `${CDN}/app/avatars/u1/avatar.jpg`,
      },
      {
        id: "u2",
        value: "https://images.example.org/avatar.jpg",
      },
    ],
  });

describe("parseMediaMigrationArgs", () => {
  it("defaults to dry-run and requires the legacy CDN URL", () => {
    expect(parseMediaMigrationArgs([`--legacy-cdn-url=${CDN}`])).toEqual({
      apply: false,
      batchSize: 100,
      legacyCdnUrl: CDN,
    });
    expect(() => parseMediaMigrationArgs([])).toThrow(
      "--legacy-cdn-url is required"
    );
  });

  it("accepts explicit apply and batch size", () => {
    expect(
      parseMediaMigrationArgs([
        `--legacy-cdn-url=${CDN}/`,
        "--apply",
        "--batch-size=25",
      ])
    ).toEqual({ apply: true, batchSize: 25, legacyCdnUrl: `${CDN}/` });
  });
});

describe("runR2MediaUrlMigration", () => {
  it("reports changes without writing in dry-run mode", async () => {
    const repository = fixture();
    const report = await runR2MediaUrlMigration(repository, {
      apply: false,
      batchSize: 1,
      legacyCdnUrl: CDN,
    });

    expect(report.totals).toEqual({ changed: 3, malformed: 1, skipped: 2 });
    expect(report.tables.eventUpdate.changedUrls).toBe(1);
    expect(report.tables.eventFeedback.changedUrls).toBe(1);
    expect(report.tables.eventFeedback.malformedIds).toEqual(["f1"]);
    expect(repository.appliedBatches).toHaveLength(0);
    expect(repository.rows.user[1]?.value).toBe(
      `${CDN}/app/avatars/u1/avatar.jpg`
    );
  });

  it("applies per batch and is idempotent on repeat", async () => {
    const repository = fixture();
    const first = await runR2MediaUrlMigration(repository, {
      apply: true,
      batchSize: 1,
      legacyCdnUrl: CDN,
    });

    expect(first.totals.changed).toBe(3);
    expect(repository.appliedBatches).toHaveLength(3);
    expect(repository.rows.user[1]?.value).toBe(
      "/api/media/avatar/u1?key=app%2Favatars%2Fu1%2Favatar.jpg"
    );
    expect(repository.rows.eventUpdate[0]?.value).toContain(
      "/api/media/event-update?eventId=event-1&key=app%2Fupdates%2Fevent-1%2Fold.jpg"
    );
    expect(repository.rows.eventUpdate[0]?.value).toContain(
      "https://images.example.org/external.jpg"
    );
    expect(repository.rows.eventFeedback[0]?.value).toContain(
      "/api/media/event-update?eventId=event-2&key=app%2Fupdates%2Fevent-2%2Ffeedback.jpg"
    );

    repository.appliedBatches.length = 0;
    const second = await runR2MediaUrlMigration(repository, {
      apply: true,
      batchSize: 1,
      legacyCdnUrl: CDN,
    });

    expect(second.totals).toEqual({ changed: 0, malformed: 1, skipped: 5 });
    expect(repository.appliedBatches).toHaveLength(0);
  });

  it("canonicalizes raw keys while leaving a wrong-event CDN URL unchanged", async () => {
    const repository = new FakeRepository({
      eventFeedback: [],
      eventUpdate: [
        {
          eventId: "event-1",
          id: "e1",
          value: plate(
            "app/updates/event-1/raw.jpg",
            `${CDN}/app/updates/event-2/wrong.jpg`
          ),
        },
      ],
      user: [{ id: "u1", value: "app/avatars/u1/raw.jpg" }],
    });

    const report = await runR2MediaUrlMigration(repository, {
      apply: true,
      batchSize: 1,
      legacyCdnUrl: CDN,
    });

    expect(report.totals).toEqual({ changed: 2, malformed: 0, skipped: 0 });
    expect(repository.rows.user[0]?.value).toBe(
      "/api/media/avatar/u1?key=app%2Favatars%2Fu1%2Fraw.jpg"
    );
    expect(repository.rows.eventUpdate[0]?.value).toContain(
      "/api/media/event-update?eventId=event-1&key=app%2Fupdates%2Fevent-1%2Fraw.jpg"
    );
    expect(repository.rows.eventUpdate[0]?.value).toContain(
      `${CDN}/app/updates/event-2/wrong.jpg`
    );
  });

  it("preserves opaque object-key characters while canonicalizing", async () => {
    const repository = new FakeRepository({
      eventFeedback: [],
      eventUpdate: [
        {
          eventId: "event-1",
          id: "e1",
          value: plate(
            `${CDN}/app/updates/event-1/literal%20.jpg`,
            `${CDN}/app/updates/event-1/question?.jpg`,
            `${CDN}/app/updates/event-1/fragment#.jpg`
          ),
        },
      ],
      user: [{ id: "u1", value: "app/avatars/u1/literal%.jpg" }],
    });

    const report = await runR2MediaUrlMigration(repository, {
      apply: true,
      batchSize: 10,
      legacyCdnUrl: CDN,
    });

    expect(report.totals).toEqual({ changed: 2, malformed: 0, skipped: 0 });
    expect(repository.rows.user[0]?.value).toBe(
      "/api/media/avatar/u1?key=app%2Favatars%2Fu1%2Fliteral%25.jpg"
    );
    expect(repository.rows.eventUpdate[0]?.value).toContain(
      "key=app%2Fupdates%2Fevent-1%2Fliteral%2520.jpg"
    );
    expect(repository.rows.eventUpdate[0]?.value).toContain(
      "key=app%2Fupdates%2Fevent-1%2Fquestion%3F.jpg"
    );
    expect(repository.rows.eventUpdate[0]?.value).toContain(
      "key=app%2Fupdates%2Fevent-1%2Ffragment%23.jpg"
    );
  });
});
