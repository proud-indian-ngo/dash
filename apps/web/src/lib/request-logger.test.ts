import { expect, it } from "bun:test";
import { fileURLToPath } from "node:url";

it("records handler duration with the real logger and preserves skipped routes", () => {
  // Isolate evlog's global configuration from other unit tests and their mocks.
  const result = Bun.spawnSync({
    cmd: [
      process.execPath,
      "--eval",
      `
        import { strict as assert } from "node:assert";
        import { initLogger } from "evlog";
        import middleware from "./server/middleware/request-logger";
        const events = [];
        initLogger({ pretty: false, drain: ({ event }) => events.push(event) });
        const traceparent = "00-0123456789abcdef0123456789abcdef-0123456789abcdef-01";
        const makeEvent = (path) => {
          const req = new Request("http://localhost" + path, { headers: { traceparent } });
          return { url: new URL(req.url), req, res: { headers: new Headers(), status: 200 }, context: {} };
        };
        const event = makeEvent("/api/timing-proof");
        const response = new Response("ok");
        assert.equal(await middleware(event, async () => {
          await Bun.sleep(60);
          return response;
        }), response);
        await Bun.sleep(20);
        assert.equal(events.length, 1);
        assert.ok(events[0].durationMs >= 50, "duration must include the handler");
        assert.equal(events[0].traceId, "0123456789abcdef0123456789abcdef");
        assert.equal(event.res.headers.get("X-Request-Id"), events[0].traceId);
        for (const path of ["/api/health", "/api/log/ingest", "/assets/example.js"]) {
          assert.equal(await middleware(makeEvent(path), async () => response), response);
        }
        await Bun.sleep(20);
        assert.equal(events.length, 1);
      `,
    ],
    cwd: fileURLToPath(new URL("../../", import.meta.url)),
    stderr: "pipe",
    stdout: "pipe",
    timeout: 10_000,
  });
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
});
