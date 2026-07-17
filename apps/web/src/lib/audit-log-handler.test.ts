import { describe, expect, it, vi } from "vitest";
import { createAuditLogGetHandler } from "./audit-log-handler";

const session = { user: { id: "actor-id", role: "super_admin" } };

function makeDependencies() {
  return {
    assertPermission: vi.fn(async () => undefined),
    load: vi.fn(async () => ({
      entries: [{ action: "user.update", id: "entry-id" }],
      facets: { actions: ["user.update"], targetTypes: ["user"] },
      total: 1,
    })),
    onLoadError: vi.fn(),
    requireSession: vi.fn(async () => ({ session })),
  };
}

describe("audit log GET handler", () => {
  it("returns the authentication response before authorization or loading", async () => {
    const dependencies = makeDependencies();
    dependencies.requireSession.mockResolvedValueOnce({
      error: Response.json({ error: "Unauthorized" }, { status: 401 }),
    } as never);

    const response = await createAuditLogGetHandler(dependencies)({
      request: new Request("https://example.test/api/audit-log"),
    });

    expect(response.status).toBe(401);
    expect(dependencies.assertPermission).not.toHaveBeenCalled();
    expect(dependencies.load).not.toHaveBeenCalled();
  });

  it("returns 403 when audit permission is denied", async () => {
    const dependencies = makeDependencies();
    dependencies.assertPermission.mockRejectedValueOnce(new Error("Forbidden"));

    const response = await createAuditLogGetHandler(dependencies)({
      request: new Request("https://example.test/api/audit-log"),
    });

    expect(response.status).toBe(403);
    expect(dependencies.load).not.toHaveBeenCalled();
  });

  it("rejects invalid query parameters before loading", async () => {
    const dependencies = makeDependencies();

    const response = await createAuditLogGetHandler(dependencies)({
      request: new Request("https://example.test/api/audit-log?limit=101"),
    });

    expect(response.status).toBe(400);
    expect(dependencies.load).not.toHaveBeenCalled();
  });

  it("passes validated filters and returns the loader response", async () => {
    const dependencies = makeDependencies();

    const response = await createAuditLogGetHandler(dependencies)({
      request: new Request(
        "https://example.test/api/audit-log?offset=20&limit=50&outcome=success&action=user.update&targetType=user&from=2026-07-01&to=2026-07-17&search=admin"
      ),
    });

    expect(response.status).toBe(200);
    expect(dependencies.load).toHaveBeenCalledWith({
      action: "user.update",
      from: "2026-07-01",
      limit: 50,
      offset: 20,
      outcome: "success",
      search: "admin",
      targetType: "user",
      to: "2026-07-17",
    });
    await expect(response.json()).resolves.toEqual({
      entries: [{ action: "user.update", id: "entry-id" }],
      facets: { actions: ["user.update"], targetTypes: ["user"] },
      total: 1,
    });
  });

  it("logs loader failures without exposing their message", async () => {
    const dependencies = makeDependencies();
    const failure = new Error("database secret");
    dependencies.load.mockRejectedValueOnce(failure);

    const response = await createAuditLogGetHandler(dependencies)({
      request: new Request("https://example.test/api/audit-log"),
    });

    expect(response.status).toBe(500);
    expect(dependencies.onLoadError).toHaveBeenCalledWith(failure, session);
    await expect(response.json()).resolves.toEqual({
      error: "Failed to fetch audit log",
    });
  });
});
