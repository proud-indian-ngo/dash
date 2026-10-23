import { defineEventHandler } from "nitro/h3";

/**
 * Seconds a request may sit without a byte moving, before or between bytes
 * of its response (monorepo.md#production-server). Bun's default of 10
 * cuts any response that builds a file or runs a long query first; 255 is
 * the most Bun allows, and a larger value is cut at 255 too.
 */
const IDLE_TIMEOUT_SECONDS = 255;

// The bun preset starts Bun.serve without an idleTimeout option, so raise it
// per request through the server srvx exposes. A no-op under Vite.
export default defineEventHandler((event) => {
  (
    event.req as {
      runtime?: {
        bun?: { server?: { timeout: (r: Request, seconds: number) => void } };
      };
    }
  ).runtime?.bun?.server?.timeout(event.req, IDLE_TIMEOUT_SECONDS);
});
