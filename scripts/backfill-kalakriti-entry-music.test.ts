import { describe, expect, it, mock } from "bun:test";

import { PgDialect } from "drizzle-orm/pg-core";

import { backfillKalakritiEntryMusic } from "./backfill-kalakriti-entry-music";

const entry = {
  id: "01900000-0000-7000-8000-000000000001",
  editionId: "edition",
  musicObjectKey: "app/kalakriti-music/edition/entry/legacy.mp3",
  musicFileName: "legacy.mp3",
  musicMimeType: "audio/mpeg",
  musicByteSize: 1024,
  musicUploadedAt: new Date(1000),
  musicUploadedBy: "user",
};

function fixture({
  children = [],
  legacy = [],
  inserted = [{ id: entry.id }],
}: { children?: object[]; legacy?: object[]; inserted?: object[] } = {}) {
  const results: unknown[][] = [
    [{ id: "edition" }],
    [{ id: "edition" }],
    [entry],
    children,
    legacy,
  ];
  const predicates: unknown[] = [];
  const select = mock(() => {
    const rows = results.shift() ?? [];
    const query = Object.assign(Promise.resolve(rows), {
      from: mock(),
      orderBy: mock(),
      where: mock(),
      for: mock(),
    });
    query.from.mockReturnValue(query);
    query.orderBy.mockReturnValue(query);
    query.where.mockImplementation((predicate) => {
      predicates.push(predicate);
      return query;
    });
    query.for.mockReturnValue(query);
    return query;
  });
  const values = mock(() => ({
    onConflictDoNothing: () => ({ returning: async () => inserted }),
  }));
  const set = mock(() => ({ where: mock(async () => undefined) }));
  const tx = {
    select,
    insert: mock(() => ({ values })),
    update: mock(() => ({ set })),
  };
  const database = {
    ...tx,
    transaction: async (operation: (value: typeof tx) => Promise<void>) =>
      operation(tx),
  };
  return {
    database: database as unknown as Parameters<
      typeof backfillKalakritiEntryMusic
    >[0],
    values,
    set,
    predicates,
  };
}

describe("entry music backfill conflicts", () => {
  it.each([false, true])(
    "reports globally conflicting child keys or IDs without clearing legacy (apply=%s)",
    async (apply) => {
      const { database, values, set, predicates } = fixture({
        children: [{ entryId: "another-entry" }],
      });
      expect(await backfillKalakritiEntryMusic(database, { apply })).toEqual({
        candidates: 0,
        updated: 0,
        malformedIds: [entry.id],
      });
      expect(values).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
      const statement = new PgDialect().sqlToQuery(
        predicates[2] as Parameters<PgDialect["sqlToQuery"]>[0]
      );
      expect(statement.sql).toContain('"kalakriti_entry_music"."id"');
      expect(statement.sql).toContain('"kalakriti_entry_music"."object_key"');
      expect(statement.params).toContain(entry.musicObjectKey);
    }
  );

  it.each([false, true])(
    "reports duplicate singleton keys across editions (apply=%s)",
    async (apply) => {
      const { database, values, set } = fixture({
        legacy: [{ id: "another-entry" }],
      });
      expect(await backfillKalakritiEntryMusic(database, { apply })).toEqual({
        candidates: 0,
        updated: 0,
        malformedIds: [entry.id],
      });
      expect(values).not.toHaveBeenCalled();
      expect(set).not.toHaveBeenCalled();
    }
  );

  it("retains legacy metadata if a concurrent claimant wins a global key or ID", async () => {
    const { database, set } = fixture({ inserted: [] });
    expect(
      await backfillKalakritiEntryMusic(database, { apply: true })
    ).toEqual({ candidates: 0, updated: 0, malformedIds: [entry.id] });
    expect(set).not.toHaveBeenCalled();
  });

  it("preserves the exact object key and upload metadata on successful apply", async () => {
    const { database, values, set } = fixture();
    expect(
      await backfillKalakritiEntryMusic(database, { apply: true })
    ).toEqual({ candidates: 1, updated: 1, malformedIds: [] });
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        id: entry.id,
        objectKey: entry.musicObjectKey,
        uploadedAt: entry.musicUploadedAt,
        uploadedBy: entry.musicUploadedBy,
      })
    );
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({ musicObjectKey: null })
    );
  });
});
