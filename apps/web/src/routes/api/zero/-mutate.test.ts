// biome-ignore-all lint/style/useFilenamingConvention: TanStack excludes route tests by leading hyphen.
import type { AsyncTask } from "@pi-dash/zero/context";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const routeConfig = { value: undefined as unknown };
  return {
    buildSessionContext: vi.fn(),
    checkRateLimit: vi.fn(),
    copyR2Object: vi.fn(),
    handleMutateRequest: vi.fn(),
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
  env: { R2_KEY_PREFIX: "app" },
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
vi.mock("@/lib/r2-upload-claim", () => ({
  copyR2Object: mocks.copyR2Object,
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
});

describe("Zero mutate task boundaries", () => {
  it("locks retained R2 keys on the mutation database transaction", async () => {
    const calls: string[] = [];
    const query = vi.fn(() => {
      calls.push("lock");
      return Promise.resolve([]);
    });
    mocks.mutatorFn.mockImplementation(
      ({
        ctx,
      }: {
        ctx: {
          beforeCommitTasks: AsyncTask[];
          lockR2Object: (r2Key: string) => Promise<void>;
        };
      }) => {
        ctx.beforeCommitTasks.push({
          fn: async () => {
            await ctx.lockR2Object("app/attachments/request/file.pdf");
            calls.push("validated");
          },
          meta: { mutator: "retain-r2-object" },
        });
      }
    );
    mocks.handleMutateRequest.mockImplementation(
      async ({
        handler,
      }: {
        handler: (transact: unknown) => Promise<unknown>;
      }) =>
        handler(
          async (
            callback: (tx: unknown, name: string, args: unknown) => unknown
          ) => {
            await callback(
              { dbTransaction: { query }, location: "server" },
              "test.mutator",
              {}
            );
            calls.push("commit");
            return { result: {} };
          }
        )
    );

    await postHandler()({
      request: new Request("http://localhost/api/zero/mutate"),
    });

    expect(query).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock_shared(hashtextextended($1, 0))",
      ["app/attachments/request/file.pdf"]
    );
    expect(calls).toEqual(["lock", "validated", "commit"]);
  });

  it("serializes new R2 target claims with an exclusive transaction lock", async () => {
    const query = vi.fn(() => Promise.resolve([]));
    mocks.mutatorFn.mockImplementation(
      ({
        ctx,
      }: {
        ctx: {
          beforeCommitTasks: AsyncTask[];
          lockR2ObjectForClaim: (r2Key: string) => Promise<void>;
        };
      }) => {
        ctx.beforeCommitTasks.push({
          fn: () =>
            ctx.lockR2ObjectForClaim(
              "app/attachments/request/upload-id-file.pdf"
            ),
          meta: { mutator: "claim-r2-object" },
        });
      }
    );
    mocks.handleMutateRequest.mockImplementation(
      async ({
        handler,
      }: {
        handler: (transact: unknown) => Promise<unknown>;
      }) =>
        handler(
          async (
            callback: (tx: unknown, name: string, args: unknown) => unknown
          ) => {
            await callback(
              { dbTransaction: { query }, location: "server" },
              "test.mutator",
              {}
            );
            return { result: {} };
          }
        )
    );

    await postHandler()({
      request: new Request("http://localhost/api/zero/mutate"),
    });

    expect(query).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      ["app/attachments/request/upload-id-file.pdf"]
    );
  });

  it("runs upload copies before the transaction commits", async () => {
    const calls: string[] = [];
    mocks.mutatorFn.mockImplementation(
      ({
        ctx,
      }: {
        ctx: { asyncTasks: AsyncTask[]; beforeCommitTasks: AsyncTask[] };
      }) => {
        ctx.beforeCommitTasks.push({
          fn: () => {
            calls.push("copy");
            return Promise.resolve();
          },
          meta: { mutator: "claim-upload" },
        });
        ctx.asyncTasks.push({
          fn: () => {
            calls.push("delete-source");
            return Promise.resolve();
          },
          meta: { mutator: "delete-temp" },
        });
      }
    );
    mocks.handleMutateRequest.mockImplementation(
      async ({
        handler,
      }: {
        handler: (transact: unknown) => Promise<unknown>;
      }) =>
        handler(
          async (
            callback: (tx: unknown, name: string, args: unknown) => unknown
          ) => {
            calls.push("transaction");
            await callback({ location: "server" }, "test.mutator", {});
            calls.push("commit");
            return { result: {} };
          }
        )
    );

    await postHandler()({
      request: new Request("http://localhost/api/zero/mutate"),
    });

    expect(calls).toEqual(["transaction", "copy", "commit"]);
    const runPostCommitTasks = mocks.withFireAndForgetLog.mock.calls[0]?.[1];
    await runPostCommitTasks?.();
    expect(calls).toEqual(["transaction", "copy", "commit", "delete-source"]);
  });

  it("discards post-commit tasks when a pre-commit copy fails", async () => {
    mocks.mutatorFn.mockImplementation(
      ({
        ctx,
      }: {
        ctx: { asyncTasks: AsyncTask[]; beforeCommitTasks: AsyncTask[] };
      }) => {
        ctx.asyncTasks.push({
          fn: () => Promise.resolve(),
          meta: { mutator: "delete-temp" },
        });
        ctx.beforeCommitTasks.push({
          fn: () => Promise.reject(new Error("copy failed")),
          meta: { mutator: "claim-upload" },
        });
      }
    );
    mocks.handleMutateRequest.mockImplementation(
      async ({
        handler,
      }: {
        handler: (transact: unknown) => Promise<unknown>;
      }) =>
        handler(
          async (
            callback: (tx: unknown, name: string, args: unknown) => unknown
          ) => {
            try {
              await callback({ location: "server" }, "test.mutator", {});
              return { result: {} };
            } catch (error) {
              return {
                result: {
                  error: "app",
                  message:
                    error instanceof Error ? error.message : String(error),
                },
              };
            }
          }
        )
    );

    const response = await postHandler()({
      request: new Request("http://localhost/api/zero/mutate"),
    });

    expect(await response.json()).toEqual({
      result: { error: "app", message: "copy failed" },
    });
    expect(mocks.withFireAndForgetLog).not.toHaveBeenCalled();
  });

  it("cleans a durable target but retains its temp source when commit fails", async () => {
    const calls: string[] = [];
    mocks.mutatorFn.mockImplementation(
      ({
        ctx,
      }: {
        ctx: {
          asyncTasks: AsyncTask[];
          beforeCommitTasks: AsyncTask[];
          rollbackTasks: AsyncTask[];
        };
      }) => {
        ctx.beforeCommitTasks.push({
          fn: () => {
            calls.push("copy");
            ctx.rollbackTasks.push({
              fn: () => {
                calls.push("delete-target");
                return Promise.resolve();
              },
              meta: { mutator: "rollback-claim" },
            });
            return Promise.resolve();
          },
          meta: { mutator: "claim-upload" },
        });
        ctx.asyncTasks.push({
          fn: () => {
            calls.push("delete-source");
            return Promise.resolve();
          },
          meta: { mutator: "delete-temp" },
        });
      }
    );
    mocks.handleMutateRequest.mockImplementation(
      async ({
        handler,
      }: {
        handler: (transact: unknown) => Promise<unknown>;
      }) =>
        handler(
          async (
            callback: (tx: unknown, name: string, args: unknown) => unknown
          ) => {
            await callback({ location: "server" }, "test.mutator", {});
            calls.push("commit-failed");
            return { result: { error: "app", message: "commit failed" } };
          }
        )
    );

    const response = await postHandler()({
      request: new Request("http://localhost/api/zero/mutate"),
    });

    expect(await response.json()).toEqual({
      result: { error: "app", message: "commit failed" },
    });
    expect(calls).toEqual(["copy", "commit-failed"]);
    const runRollbackTasks = mocks.withFireAndForgetLog.mock.calls[0]?.[1];
    await runRollbackTasks?.();
    expect(calls).toEqual(["copy", "commit-failed", "delete-target"]);
  });

  it("cleans earlier durable targets when a later pre-commit copy fails", async () => {
    const calls: string[] = [];
    mocks.mutatorFn.mockImplementation(
      ({
        ctx,
      }: {
        ctx: { beforeCommitTasks: AsyncTask[]; rollbackTasks: AsyncTask[] };
      }) => {
        ctx.beforeCommitTasks.push(
          {
            fn: () => {
              calls.push("copy-first");
              ctx.rollbackTasks.push({
                fn: () => {
                  calls.push("delete-first-target");
                  return Promise.resolve();
                },
                meta: { mutator: "rollback-first" },
              });
              return Promise.resolve();
            },
            meta: { mutator: "claim-first" },
          },
          {
            fn: () => Promise.reject(new Error("second copy failed")),
            meta: { mutator: "claim-second" },
          }
        );
      }
    );
    mocks.handleMutateRequest.mockImplementation(
      async ({
        handler,
      }: {
        handler: (transact: unknown) => Promise<unknown>;
      }) =>
        handler(
          async (
            callback: (tx: unknown, name: string, args: unknown) => unknown
          ) => {
            try {
              await callback({ location: "server" }, "test.mutator", {});
              return { result: {} };
            } catch (error) {
              return {
                result: {
                  error: "app",
                  message:
                    error instanceof Error ? error.message : String(error),
                },
              };
            }
          }
        )
    );

    await postHandler()({
      request: new Request("http://localhost/api/zero/mutate"),
    });

    expect(calls).toEqual(["copy-first"]);
    const runRollbackTasks = mocks.withFireAndForgetLog.mock.calls[0]?.[1];
    await runRollbackTasks?.();
    expect(calls).toEqual(["copy-first", "delete-first-target"]);
  });

  it("isolates post-commit queues between mutations", async () => {
    let invocation = 0;
    mocks.mutatorFn.mockImplementation(
      ({ ctx }: { ctx: { asyncTasks: AsyncTask[] } }) => {
        invocation += 1;
        if (invocation === 1) {
          ctx.asyncTasks.push({
            fn: () => Promise.resolve(),
            meta: { mutator: "first" },
          });
        }
      }
    );
    mocks.handleMutateRequest.mockImplementation(
      async ({
        handler,
      }: {
        handler: (transact: unknown) => Promise<unknown>;
      }) => {
        await handler(
          async (
            callback: (tx: unknown, name: string, args: unknown) => unknown
          ) => {
            await callback({ location: "server" }, "first.mutator", {});
            return { result: {} };
          }
        );
        await handler(
          async (
            callback: (tx: unknown, name: string, args: unknown) => unknown
          ) => {
            await callback({ location: "server" }, "second.mutator", {});
            return { result: {} };
          }
        );
        return { result: {} };
      }
    );

    await postHandler()({
      request: new Request("http://localhost/api/zero/mutate"),
    });

    expect(mocks.withFireAndForgetLog).toHaveBeenCalledTimes(1);
  });
});
