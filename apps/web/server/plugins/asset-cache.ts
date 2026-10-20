import { definePlugin } from "nitro";

// Nitro's `/assets/**` route rule stamps `immutable, max-age=1y` on every
// response under that path, including errors. A cached 404 or redirect would
// pin a broken chunk in the browser and Cloudflare until the cache is
// cleared, so only successful asset responses keep the long-lived header.
// The route rule runs inside the handler chain; this hook sees the final
// response after it.
export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("response", (response, event) => {
    if (!new URL(event.req.url).pathname.startsWith("/assets/")) {
      return;
    }
    // Nitro adds Vary only when the request advertises a compression format.
    // Identity responses must vary too, or a cache can reuse them for browsers.
    if (
      !response.headers.get("Vary")?.toLowerCase().includes("accept-encoding")
    ) {
      response.headers.append("Vary", "Accept-Encoding");
    }
    const failed = response.status >= 300 && response.status !== 304;
    if (failed) {
      response.headers.set("Cache-Control", "no-store");
    }
  });
});
