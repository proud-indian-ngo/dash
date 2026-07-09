import type { AsyncTask } from "@pi-dash/zero/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const routeConfig = { value: undefined as unknown };
  return {
    buildSessionContext: vi.fn(),
    checkRateLimit: vi.fn(),
    handleMutateRequest: vi.fn(),
    moveR2Object: vi.fn(),
    mutatorFn: vi.fn(),
    parseTraceparent: vi.fn(),
    rateLimitResponse: vi.fn(),
    requireSession: vi.fn(),
    routeConfig,
    withFireAndForgetLog: vi.fn(),
    zeroDrizzle: vi.fn(),
  };
});

vi.mock("@pi-dash/db", () => ({ db: {} }));
vi.mock("@pi-dash/env/server", () => ({
  env: { R2_KEY_PREFIX: "test-prefix" },
}));
vi.mock("@pi-dash/jobs/r2-object", () => ({
  moveR2Object: mocks.moveR2Object,
}));
vi.mock("@pi-dash/observability", () => ({
  withFireAndForgetLog: mocks.withFireAndForgetLog,
}));
vi.mock("@pi-dash/observability/trace-context", () => ({
  parseTraceparent: mocks.parseTraceparent,
}));
vi.mock("@pi-dash/zero/mutators", () => ({ mutators: {} }));
vi.mock("@pi-dash/zero/schema", () => ({ schema: {} }));
vi.mock("@rocicorp/zero", () => ({
  mustGetMutator: () => ({ fn: mocks.mutatorFn }),
}));
vi.mock("@rocicorp/zero/server", () => ({
  handleMutateRequest: mocks.handleMutateRequest,
}));
vi.mock("@rocicorp/zero/server/adapters/drizzle", () => ({
  zeroDrizzle: mocks.zeroDrizzle,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (config: unknown) => {
    mocks.routeConfig.value = config;
    return config;
  },
}));
vi.mock("@/lib/api-auth", () => ({
  buildSessionContext: mocks.buildSessionContext,
  requireSession: mocks.requireSession,
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: mocks.checkRateLimit,
  rateLimitResponse: mocks.rateLimitResponse,
}));

await import("./mutate");

const postHandler = () =>
  (
    mocks.routeConfig.value as {
      server: {
        handlers: {
          POST: (input: { request: Request }) => Promise<Response>;
        };
      };
    }
  ).server.handlers.POST;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireSession.mockResolvedValue({
    error: null,
    session: { user: { id: "user-1" } },
  });
  mocks.buildSessionContext.mockResolvedValue({
    permissions: [],
    role: "volunteer",
    userId: "user-1",
  });
  mocks.checkRateLimit.mockReturnValue({ allowed: true });
  mocks.handleMutateRequest.mockImplementation(
    async ({ handler }: { handler: (transact: unknown) => Promise<unknown> }) =>
      handler(
        async (cb: (tx: unknown, name: string, args: unknown) => unknown) => {
          try {
            await cb({ location: "server" }, "test.mutator", {});
            return { result: {} };
          } catch (error) {
            return {
              result: {
                error: "app",
                message: error instanceof Error ? error.message : String(error),
              },
            };
          }
        }
      )
  );
});

describe("zero mutate route async task draining", () => {
  it("awaits blocking tasks before returning and leaves background tasks queued", async () => {
    const calls: string[] = [];
    const backgroundTask: AsyncTask = {
      fn: () => {
        calls.push("notify");
        return Promise.resolve();
      },
      meta: { mutator: "notify" },
    };

    mocks.mutatorFn.mockImplementation(
      ({ ctx }: { ctx: { asyncTasks: AsyncTask[] } }) => {
        ctx.asyncTasks.push(backgroundTask);
        ctx.asyncTasks.push({
          blocking: true,
          fn: async () => {
            calls.push("move:start");
            await Promise.resolve();
            calls.push("move:end");
          },
          meta: { mutator: "move" },
        });
      }
    );

    const response = await postHandler()({
      request: new Request("http://localhost/api/zero/mutate"),
    });

    expect(response.status).toBe(200);
    expect(calls).toEqual(["move:start", "move:end"]);
    expect(mocks.withFireAndForgetLog).toHaveBeenCalledTimes(1);
    expect(mocks.withFireAndForgetLog.mock.calls[0]?.[1]).toBeTypeOf(
      "function"
    );
  });

  it("turns blocking task failures into mutation errors without starting background work", async () => {
    const calls: string[] = [];
    const backgroundTask: AsyncTask = {
      fn: () => {
        calls.push("notify");
        return Promise.resolve();
      },
      meta: { mutator: "notify" },
    };

    mocks.mutatorFn.mockImplementation(
      ({ ctx }: { ctx: { asyncTasks: AsyncTask[] } }) => {
        ctx.asyncTasks.push(backgroundTask);
        ctx.asyncTasks.push({
          blocking: true,
          fn: () => {
            calls.push("move");
            return Promise.reject(new Error("move failed"));
          },
          meta: { mutator: "move" },
        });
      }
    );

    const response = await postHandler()({
      request: new Request("http://localhost/api/zero/mutate"),
    });

    expect(await response.json()).toEqual({
      result: { error: "app", message: "move failed" },
    });
    expect(calls).toEqual(["move"]);
    expect(mocks.withFireAndForgetLog).not.toHaveBeenCalled();
  });

  it("runs later background tasks when an earlier background task fails", async () => {
    const calls: string[] = [];

    mocks.mutatorFn.mockImplementation(
      ({ ctx }: { ctx: { asyncTasks: AsyncTask[] } }) => {
        ctx.asyncTasks.push({
          fn: async () => {
            calls.push("first");
            await Promise.resolve();
            throw new Error("first failed");
          },
          meta: { mutator: "first" },
        });
        ctx.asyncTasks.push({
          fn: async () => {
            await Promise.resolve();
            calls.push("second");
          },
          meta: { mutator: "second" },
        });
      }
    );

    const response = await postHandler()({
      request: new Request("http://localhost/api/zero/mutate"),
    });

    expect(response.status).toBe(200);
    expect(mocks.withFireAndForgetLog).toHaveBeenCalledTimes(1);
    const runBackgroundTasks = mocks.withFireAndForgetLog.mock.calls[0]?.[1];
    await expect(runBackgroundTasks?.()).rejects.toThrow(
      "One or more mutation async tasks failed"
    );
    expect(calls).toEqual(["first", "second"]);
  });
});
