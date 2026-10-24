import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { expect, test } from "../../fixtures/test";

const execFileAsync = promisify(execFile);
async function fixture(...args: string[]) {
  const { stdout } = await execFileAsync(
    "bun",
    [
      "run",
      path.resolve(import.meta.dirname, "../../helpers/jobs-authorization.ts"),
      ...args,
    ],
    { env: process.env }
  );
  return stdout.trim();
}

test("job operators can manage jobs without submitting or reading private content", async ({
  request,
  playwright,
  baseURL,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "super_admin",
    "Requires superadmin fixture creation"
  );
  const tag = `${Date.now()}-${testInfo.workerIndex}`;
  await fixture("setup", tag);
  const operator = await playwright.request.newContext({ baseURL });
  let id = "";
  try {
    const login = await operator.post("/api/auth/sign-in/email", {
      data: {
        email: `jobs-${tag}@example.test`,
        password: "Jobs-test-password-123!",
      },
    });
    expect(login.ok()).toBe(true);
    const data = {
      message: `private-${tag}`,
      targetAddress: "919800000001",
      recipientRowId: "019f0000-0090-7000-8000-000000000099",
    };
    const created = await request.post("/api/jobs", {
      data: {
        queue: "send-scheduled-whatsapp",
        data,
        options: {
          startAfter: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
    });
    expect(created.status()).toBe(201);
    id = (await created.json()).id;
    expect(id).toBeTruthy();
    await fixture("fail", tag, id);

    const forbidden = await operator.post("/api/jobs", {
      data: {
        queue: "delete-r2-object",
        data: { mode: "temporary-source", r2Key: "app/private.pdf" },
        options: {
          startAfter: new Date(Date.now() + 86_400_000).toISOString(),
        },
      },
    });
    expect(forbidden.status()).toBe(403);
    const detail = await operator.get(`/api/jobs/${id}`);
    expect(detail.status()).toBe(200);
    const job = (await detail.json()).job;
    expect(Object.keys(job).sort()).toEqual(
      [
        "completedOn",
        "createdOn",
        "id",
        "name",
        "priority",
        "retryCount",
        "retryLimit",
        "startAfter",
        "startedOn",
        "state",
      ].sort()
    );
    expect(job.state).toBe("failed");
    const list = await operator.get(
      "/api/jobs?queue=send-scheduled-whatsapp&state=failed&limit=100"
    );
    expect(list.status()).toBe(200);
    const rows = (await list.json()).jobs;
    expect(rows.some((row: { id: string }) => row.id === id)).toBe(true);
    for (const row of rows) {
      expect(row).not.toHaveProperty("data");
      expect(row).not.toHaveProperty("output");
    }
    expect((await operator.get("/api/jobs/stats")).status()).toBe(200);
    const raw = (await (await request.get(`/api/jobs/${id}`)).json()).job;
    expect(raw.data).toEqual({ ...data, __traceId: expect.any(String) });
    expect(raw.output).toEqual({ error: "private failure output" });
    expect(
      (
        await operator.post(`/api/jobs/${id}/retry`, {
          data: { data: { message: "forged" }, queue: "delete-r2-object" },
        })
      ).status()
    ).toBe(200);
    expect(JSON.parse(await fixture("inspect", tag, id)).data).toEqual(
      raw.data
    );
    expect((await operator.post(`/api/jobs/${id}/cancel`)).status()).toBe(200);
    await testInfo.attach("job-operator-boundary", {
      body: JSON.stringify({
        enqueue: forbidden.status(),
        operationalFields: Object.keys(job).sort(),
        payloadUnchanged: true,
      }),
      contentType: "application/json",
    });
  } finally {
    await operator.dispose();
    await fixture("clear", tag, id);
  }
});

test("volunteers cannot inspect job metadata", async ({
  request,
}, testInfo) => {
  test.skip(testInfo.project.name !== "volunteer", "Volunteer boundary");
  expect((await request.get("/api/jobs")).status()).toBe(403);
});
