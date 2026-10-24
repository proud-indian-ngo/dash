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
  page,
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
    await page.goto("/jobs");
    const created = await page.evaluate(
      async (body) => {
        const response = await fetch("/api/jobs", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        return { status: response.status, body: await response.json() };
      },
      {
        queue: "send-scheduled-whatsapp",
        data,
        options: {
          startAfter: new Date(Date.now() + 86_400_000).toISOString(),
        },
      }
    );
    expect(created.status).toBe(201);
    id = created.body.id;
    expect(id).toBeTruthy();
    await fixture("fail", tag, id);

    await test.step("cookie writes reject untrusted browser requests and preserve Zero callbacks", async () => {
      const trustedOrigin = new URL(baseURL!).origin;
      const siblingOrigin = new URL(trustedOrigin);
      siblingOrigin.hostname = `sibling.${siblingOrigin.hostname}`;
      const refused: { path: string; status: number }[] = [];
      for (const headers of [
        { origin: siblingOrigin.origin, "sec-fetch-site": "same-site" },
        {
          origin: "https://foreign.example.test",
          "sec-fetch-site": "cross-site",
        },
        { origin: trustedOrigin, "sec-fetch-site": "same-site" },
      ]) {
        for (const path of [
          `/api/jobs/${id}/retry`,
          `/api/jobs/${id}/cancel`,
          "/api/zero/query",
          "/api/zero/mutate",
        ]) {
          const response = await request.post(path, {
            headers: { ...headers, "content-type": "text/plain" },
            data: "{}",
          });
          refused.push({ path, status: response.status() });
          expect(response.status()).toBe(403);
        }
      }
      expect(
        (await (await request.get(`/api/jobs/${id}`)).json()).job.state
      ).toBe("failed");
      const query = await request.post("/api/zero/query", {
        data: ["transform", []],
      });
      expect(query.status()).toBe(200);
      expect((await query.json()).kind).toBe("QueryResponse");
      const mutate = await request.post(
        "/api/zero/mutate?schema=zero_0&appID=zero",
        {
          data: {
            clientGroupID: `e2e-csrf-${tag}`,
            mutations: [],
            pushVersion: 1,
            requestID: `e2e-csrf-${tag}`,
            timestamp: Date.now(),
          },
        }
      );
      expect(mutate.status()).toBe(200);
      expect((await mutate.json()).mutations).toEqual([]);
      await testInfo.attach("cookie-write-csrf-boundary", {
        body: JSON.stringify({
          refused,
          sameOriginBrowserCreate: created.status,
          headerlessQuery: query.status(),
          headerlessMutate: mutate.status(),
          jobState: "failed",
        }),
        contentType: "application/json",
      });
    });

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
