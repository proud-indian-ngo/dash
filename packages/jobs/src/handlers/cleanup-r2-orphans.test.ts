import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const eventId = "event-1";
  const key = `app/updates/${eventId}/escaped.jpg`;
  const url = `/api/media/event-update?eventId=${eventId}&key=${encodeURIComponent(key)}`;
  const content = JSON.stringify([
    { children: [{ text: "" }], type: "img", url },
  ]).replaceAll("/", "\\u002F");
  return {
    content,
    deleteObject: vi.fn(),
    eventId,
    execute: vi.fn(),
    fromCall: 0,
    key,
    list: vi.fn(),
    select: vi.fn(),
  };
});

vi.mock("@pi-dash/db", () => ({
  db: { execute: mocks.execute, select: mocks.select },
}));
vi.mock("@pi-dash/env/server", () => ({
  env: {
    R2_ACCESS_KEY: "test-access",
    R2_ACCOUNT_ID: "test-account",
    R2_BUCKET_NAME: "test-bucket",
    R2_KEY_PREFIX: "app",
    R2_SECRET_ACCESS_KEY: "test-secret",
    VITE_CDN_URL: "https://cdn.example.test",
  },
}));
vi.mock("@pi-dash/notifications/helpers", () => ({
  getUserIdsWithPermission: vi.fn(async () => []),
}));
vi.mock("@pi-dash/notifications/send/reminders", () => ({
  notifyR2CleanupResults: vi.fn(),
}));
vi.mock("bun", () => ({
  S3Client: { delete: mocks.deleteObject, list: mocks.list },
}));
vi.mock("evlog", () => ({
  createRequestLogger: () => ({
    emit: vi.fn(),
    error: vi.fn(),
    set: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { handleCleanupR2Orphans } from "./cleanup-r2-orphans";

const query = (rows: unknown[]) =>
  Object.assign(Promise.resolve(rows), {
    where: vi.fn(async () => []),
  });

beforeEach(() => {
  vi.clearAllMocks();
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
});

describe("handleCleanupR2Orphans", () => {
  it("retains a live key referenced by escaped canonical Plate JSON", async () => {
    const result = await handleCleanupR2Orphans([
      { data: { dryRun: false } },
    ] as never);

    expect(result).toMatchObject({ orphanCount: 0, r2ObjectCount: 1 });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});
