import { beforeEach, describe, expect, it, mock } from "bun:test";

const findEvent = mock();
const findTeamMember = mock();
const resolvePermissions = mock(async () => [] as string[]);
const getImmichConfig = mock(async () => ({ apiKey: "key", url: "url" }));
const ensureImmichAlbum = mock(async () => "album-1");
const uploadAssetToImmich = mock(async () => "asset-1");
const addAssetToAlbum = mock(async () => undefined);

mock.module("@pi-dash/db", () => ({
  db: {
    query: {
      teamEvent: { findFirst: findEvent },
      teamMember: { findFirst: findTeamMember },
    },
  },
}));
mock.module("@pi-dash/db/queries/resolve-permissions", () => ({
  resolvePermissions,
}));
mock.module("@pi-dash/db/schema/team-event", () => ({
  teamEvent: { id: "id" },
}));
mock.module("drizzle-orm", () => ({ eq: () => true }));
mock.module("@/lib/audit", () => ({
  runSessionAuditedAction: async (
    _session: unknown,
    _headers: unknown,
    _options: unknown,
    action: () => Promise<unknown>
  ) => action(),
}));
mock.module("@/lib/immich", () => ({
  addAssetToAlbum,
  ensureImmichAlbum,
  getImmichConfig,
  uploadAssetToImmich,
}));
mock.module("@/middleware/auth", () => ({ authMiddleware: {} }));
mock.module("evlog", () => ({
  createRequestLogger: () => ({
    emit: mock(),
    error: mock(),
    set: mock(),
  }),
  log: { error: mock() },
}));
mock.module("@tanstack/react-start", () => ({
  createServerFn: () => ({
    middleware: () => ({
      validator: () => ({ handler: (handler: unknown) => handler }),
    }),
  }),
}));

const { uploadPhotoToImmich, validateImmichUploadInput } =
  await import("./immich-upload");

const session = {
  user: { id: "user-1", role: "volunteer" },
};
const data = {
  eventId: "event-1",
  file: new File(["photo"], "photo.jpg", { type: "image/jpeg" }),
  mimeType: "image/jpeg",
  photoId: "0199f2ea-22ba-7000-8000-000000000001",
};

function run(overrides: Partial<typeof data> = {}) {
  return (
    uploadPhotoToImmich as unknown as (input: unknown) => Promise<unknown>
  )({
    context: { headers: new Headers(), session },
    data: { ...data, ...overrides },
  });
}

beforeEach(() => {
  findEvent.mockReset();
  findTeamMember.mockReset();
  resolvePermissions.mockReset();
  getImmichConfig.mockClear();
  ensureImmichAlbum.mockClear();
  uploadAssetToImmich.mockClear();
  addAssetToAlbum.mockClear();
  resolvePermissions.mockResolvedValue([]);
  getImmichConfig.mockResolvedValue({ apiKey: "key", url: "url" });
});

describe("direct Immich upload authorization", () => {
  it("requires a UUID photo ID supplied by the client", () => {
    const formData = new FormData();
    formData.append("eventId", "event-1");
    formData.append("file", data.file);

    expect(() => validateImmichUploadInput(formData)).toThrow(
      "Missing file, eventId, or photoId"
    );
    formData.append("photoId", "not-a-uuid");
    expect(() => validateImmichUploadInput(formData)).toThrow(
      "Invalid photoId"
    );
  });

  it("checks current event and photo authority before external work", async () => {
    findEvent.mockResolvedValue({
      managementDomain: null,
      name: "Future event",
      recurrenceRule: null,
      seriesId: null,
      originalDate: null,
      startTime: new Date(Date.now() + 60_000),
      teamId: "team-1",
    });

    expect(await run()).toEqual({
      error: "Cannot upload photos before event starts",
    });
    expect(resolvePermissions).not.toHaveBeenCalled();
    expect(getImmichConfig).not.toHaveBeenCalled();
    expect(uploadAssetToImmich).not.toHaveBeenCalled();
  });

  it("rejects a user without current authority before external work", async () => {
    const configCalls = getImmichConfig.mock.calls.length;
    const uploadCalls = uploadAssetToImmich.mock.calls.length;
    findEvent.mockResolvedValue({
      managementDomain: null,
      name: "Event",
      recurrenceRule: null,
      seriesId: null,
      originalDate: null,
      startTime: new Date(0),
      teamId: "team-1",
    });
    findTeamMember.mockResolvedValue(undefined);

    expect(await run()).toEqual({
      error:
        "Only users with photo management permission or team leads can upload directly to Immich",
    });
    expect(getImmichConfig).toHaveBeenCalledTimes(configCalls);
    expect(uploadAssetToImmich).toHaveBeenCalledTimes(uploadCalls);
  });

  it("returns a receipt bound to the uploaded asset and client photo ID", async () => {
    findEvent.mockResolvedValue({
      managementDomain: null,
      name: "Event",
      recurrenceRule: null,
      seriesId: null,
      originalDate: null,
      startTime: new Date(0),
      teamId: "team-1",
    });
    resolvePermissions.mockResolvedValue(["events.manage_photos"]);

    const result = (await run()) as {
      immichAssetId: string;
      immichUploadReceipt: string;
    };

    expect(result.immichAssetId).toBe("asset-1");
    expect(result.immichUploadReceipt).toMatch(/^\d+\.[0-9a-f]{64}$/);
    expect(uploadAssetToImmich).toHaveBeenCalledTimes(1);
    expect(addAssetToAlbum).toHaveBeenCalledWith(
      expect.anything(),
      "album-1",
      "asset-1"
    );
  });
});
