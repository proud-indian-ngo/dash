/**
 * Dev-only proxy that buffers incoming GoWA webhook requests and re-sends them
 * to the Vite dev server with Content-Length instead of chunked encoding.
 *
 * Why: Vite's Node.js dev server returns 400 for Transfer-Encoding: chunked
 * POST requests. Go's net/http sometimes sends chunked. This proxy normalises
 * the request. Not needed in production (Nitro handles requests directly).
 */
declare const Bun: typeof import("bun");

const proxyPort = Number(process.env.WHATSAPP_WEBHOOK_PROXY_PORT ?? "3002");
const proxyTarget =
  process.env.WHATSAPP_WEBHOOK_PROXY_TARGET ??
  "http://[::1]:3001/api/whatsapp/webhook";

Bun.serve({
  port: proxyPort,
  hostname: "0.0.0.0",
  async fetch(request) {
    const body = ["GET", "HEAD"].includes(request.method)
      ? undefined
      : await request.bytes();
    const contentType = request.headers.get("content-type");
    const signature = request.headers.get("x-hub-signature-256");

    try {
      const response = await fetch(proxyTarget, {
        method: request.method,
        headers: {
          ...(contentType ? { "content-type": contentType } : {}),
          ...(signature ? { "x-hub-signature-256": signature } : {}),
        },
        body,
      });

      const responseBody = await response.text();
      return new Response(responseBody, {
        status: response.status,
        headers: {
          "content-type":
            response.headers.get("content-type") ??
            "application/json;charset=utf-8",
        },
      });
    } catch (error) {
      console.error(
        "[webhook-proxy]",
        error instanceof Error ? error.message : String(error)
      );
      return Response.json({ error: "Webhook proxy failed" }, { status: 502 });
    }
  },
});

console.log(
  `[webhook-proxy] listening on http://0.0.0.0:${proxyPort} -> ${proxyTarget}`
);
