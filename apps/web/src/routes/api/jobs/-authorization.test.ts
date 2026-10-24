// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.
import { beforeEach, describe, expect, it, mock } from "bun:test";

// Failure cases: jobs.manage permits arbitrary enqueue or raw content reads;
// retry/cancel accept replacement payloads; operational access is lost.
let role = "jobs_operator";
const execute = mock();
const enqueue = mock(async () => "job-created");
const retry = mock(async () => undefined);
const cancel = mock(async () => undefined);
mock.module("@pi-dash/db", () => ({ db: { execute } }));
mock.module("@pi-dash/jobs/enqueue", () => ({
  enqueue,
  QUEUE_NAMES: ["send-scheduled-whatsapp", "delete-r2-object"],
}));
mock.module("@pi-dash/jobs/boss-instance", () => ({
  ensureBossReady: async () => ({ retry, cancel }),
}));
mock.module("@/lib/api-auth", () => ({
  requireSession: async () => ({ session: { user: { id: "operator", role } } }),
  assertServerPermission: async () => {
    if (role === "volunteer") throw new Error("Forbidden");
  },
}));
mock.module("@/lib/audit", () => ({
  runSessionAuditedAction: async (
    _session: unknown,
    _headers: unknown,
    _metadata: unknown,
    run: () => unknown
  ) => await run(),
  classifyAuditResponse: mock(),
}));
mock.module("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
}));
mock.module("evlog", () => ({
  createRequestLogger: () => ({ set: mock(), error: mock(), emit: mock() }),
}));

const { Route: list } = await import("./index");
const { Route: detail } = await import("./$id");
const { Route: retryRoute } = await import("./$id/retry");
const { Route: cancelRoute } = await import("./$id/cancel");
type Handler = (input: {
  request: Request;
  params: { id: string };
}) => Promise<Response>;
function handler(route: unknown, method: "GET" | "POST"): Handler {
  return (
    route as { options: { server: { handlers: Record<string, Handler> } } }
  ).options.server.handlers[method]!;
}
const id = "019f0000-0090-7000-8000-000000000001";
const operational = {
  id,
  name: "send-scheduled-whatsapp",
  state: "failed",
  priority: 0,
  retryCount: 1,
  retryLimit: 3,
  createdOn: "2026-10-24T00:00:00Z",
  startedOn: null,
  completedOn: null,
  startAfter: "2026-10-24T00:00:00Z",
};
const row = {
  ...operational,
  data: { message: "private message", targetAddress: "919800000001" },
  output: { error: "private error" },
  unexpected: "private future field",
};
const input = (method: "GET" | "POST", body?: object) => ({
  request: new Request("https://example.test/api/jobs", {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  }),
  params: { id },
});
beforeEach(() => {
  mock.clearAllMocks();
  execute.mockReset();
  role = "jobs_operator";
});

describe("job API authorization", () => {
  it("refuses arbitrary enqueue for a jobs-only role", async () => {
    const response = await handler(
      list,
      "POST"
    )(
      input("POST", {
        queue: "delete-r2-object",
        data: { mode: "temporary-source", r2Key: "app/private.pdf" },
      })
    );
    expect(response.status).toBe(403);
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("allows superadmin enqueue", async () => {
    role = "super_admin";
    const response = await handler(
      list,
      "POST"
    )(
      input("POST", {
        queue: "delete-r2-object",
        data: { mode: "if-unreferenced", r2Key: "app/private.pdf" },
      })
    );
    expect(response.status).toBe(201);
    expect(enqueue).toHaveBeenCalledTimes(1);
  });
  it("lists only allowlisted operational fields", async () => {
    execute.mockResolvedValueOnce([row]).mockResolvedValueOnce([{ total: 1 }]);
    const response = await handler(list, "GET")(input("GET"));
    expect(response.status).toBe(200);
    expect((await response.json()).jobs).toEqual([operational]);
  });
  it("returns only operational details", async () => {
    execute.mockResolvedValueOnce([row]);
    const response = await handler(detail, "GET")(input("GET"));
    expect(await response.json()).toEqual({ job: operational });
  });
  it("allows superadmin raw details", async () => {
    role = "super_admin";
    execute.mockResolvedValueOnce([row]);
    const response = await handler(detail, "GET")(input("GET"));
    expect((await response.json()).job).toMatchObject({
      data: row.data,
      output: row.output,
    });
  });
  it.each([
    [retryRoute, retry],
    [cancelRoute, cancel],
  ] as const)(
    "operational actions ignore caller payloads",
    async (route, action) => {
      execute.mockResolvedValueOnce([row]);
      const response = await handler(
        route,
        "POST"
      )(
        input("POST", {
          queue: "delete-r2-object",
          data: { r2Key: "forged" },
          options: { data: { message: "forged" } },
        })
      );
      expect(response.status).toBe(200);
      expect(action).toHaveBeenCalledWith(row.name, id);
      expect(enqueue).not.toHaveBeenCalled();
    }
  );
  it("does not permit listing without jobs.manage", async () => {
    role = "volunteer";
    expect((await handler(list, "GET")(input("GET"))).status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });
});
