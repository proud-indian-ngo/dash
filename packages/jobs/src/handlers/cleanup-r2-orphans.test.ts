import { beforeEach, describe, expect, it, mock, spyOn } from "bun:test";

import { S3Client } from "bun";

const hoisted = <T>(factory: () => T): T => factory();

const mocks = hoisted(() => {
  const eventId = "event-1";
  const key = `app/updates/${eventId}/escaped.jpg`;
  const url = `/api/media/event-update?eventId=${eventId}&key=${encodeURIComponent(key)}`;
  const content = JSON.stringify([
    { children: [{ text: "" }], type: "img", url },
  ]).replaceAll("/", "\\u002F");
  return {
    content,
    deleteObject: mock(),
    eventId,
    execute: mock(),
    fromCall: 0,
    key,
    list: mock(),
    select: mock(),
    validContent: content,
    withReferenceLock: mock(),
  };
});

mock.module("@pi-dash/db", () => ({
  db: { execute: mocks.execute, select: mocks.select },
}));
mock.module("@pi-dash/env/server", () => ({
  env: {
    R2_ACCESS_KEY: "test-access",
    R2_ACCOUNT_ID: "test-account",
    R2_BUCKET_NAME: "test-bucket",
    R2_KEY_PREFIX: "app",
    R2_SECRET_ACCESS_KEY: "test-secret",
    VITE_CDN_URL: "https://cdn.example.test",
  },
}));
mock.module("@pi-dash/notifications/helpers", () => ({
  getUserIdsWithPermission: mock(async () => []),
}));
mock.module("@pi-dash/notifications/send/reminders", () => ({
  notifyR2CleanupResults: mock(),
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({
    emit: mock(),
    error: mock(),
    set: mock(),
    warn: mock(),
  }),
}));
mock.module("../lib/protected-r2-reference", () => ({
  withProtectedR2ObjectReferenceLock: mocks.withReferenceLock,
}));

spyOn(S3Client, "list").mockImplementation(((...args: unknown[]) =>
  mocks.list(...args)) as never);
spyOn(S3Client, "delete").mockImplementation(((...args: unknown[]) =>
  mocks.deleteObject(...args)) as never);

const { handleCleanupR2Orphans } = await import("./cleanup-r2-orphans");

const query = (rows: unknown[]) =>
  Object.assign(Promise.resolve(rows), {
    where: mock(async () => []),
  });

beforeEach(() => {
  mock.clearAllMocks();
  mocks.content = mocks.validContent;
  mocks.fromCall = 0;
  mocks.execute.mockResolvedValue([]);
  mocks.list.mockResolvedValue({
    contents: [{ key: mocks.key, lastModified: "2000-01-01T00:00:00Z" }],
    isTruncated: false,
  });
  mocks.deleteObject.mockResolvedValue(undefined);
  mocks.select.mockImplementation(() => ({
    from: () => {
      const call = mocks.fromCall;
      mocks.fromCall += 1;
      return query(
        call === 2 ? [{ content: mocks.content, eventId: mocks.eventId }] : []
      );
    },
  }));
  mocks.withReferenceLock.mockImplementation(async (_key, operation) =>
    operation(false)
  );
});

describe("handleCleanupR2Orphans", () => {
  it("retains a live key referenced by escaped canonical Plate JSON", async () => {
    const result = await handleCleanupR2Orphans([
      { data: { dryRun: false } },
    ] as never);

    expect(result).toMatchObject({ orphanCount: 0, r2ObjectCount: 1 });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("retains all update objects when content cannot be traversed", async () => {
    mocks.content = String.raw`{"broken":"app\u002Fupdates\u002Fevent-1\u002Fhidden.jpg"`;

    const result = await handleCleanupR2Orphans([
      { data: { dryRun: false } },
    ] as never);

    expect(result).toMatchObject({ orphanCount: 0, r2ObjectCount: 1 });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("rechecks references under lock before deleting an orphan", async () => {
    const orphanKey = "app/attachments/orphan.pdf";
    mocks.list.mockResolvedValue({
      contents: [{ key: orphanKey, lastModified: "2000-01-01T00:00:00Z" }],
      isTruncated: false,
    });
    mocks.withReferenceLock.mockImplementation(async (_key, operation) =>
      operation(true)
    );

    const result = await handleCleanupR2Orphans([
      { data: { dryRun: false } },
    ] as never);

    expect(result).toMatchObject({ deleted: 0, orphanCount: 1 });
    expect(mocks.withReferenceLock).toHaveBeenCalledWith(
      orphanKey,
      expect.any(Function)
    );
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("deletes an orphan after the locked reference recheck", async () => {
    const orphanKey = "app/attachments/orphan.pdf";
    mocks.list.mockResolvedValue({
      contents: [{ key: orphanKey, lastModified: "2000-01-01T00:00:00Z" }],
      isTruncated: false,
    });

    const result = await handleCleanupR2Orphans([
      { data: { dryRun: false } },
    ] as never);

    expect(result).toMatchObject({ deleted: 1, orphanCount: 1 });
    expect(mocks.withReferenceLock).toHaveBeenCalledWith(
      orphanKey,
      expect.any(Function)
    );
    expect(mocks.deleteObject).toHaveBeenCalledWith(
      orphanKey,
      expect.any(Object)
    );
  });
});
