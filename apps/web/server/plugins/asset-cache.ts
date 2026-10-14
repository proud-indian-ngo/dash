import { definePlugin } from "nitro";

// Nitro's `/assets/**` route rule stamps `immutable, max-age=1y` on every
// response under that path, including errors. A cached 404 or redirect would
// pin a broken chunk in the browser and Cloudflare until the cache is
// cleared, so only successful asset responses keep the long-lived header.
// The route rule runs inside the handler chain; this hook sees the final
// response after it.
export default definePlugin((nitroApp) => {
  nitroApp.hooks.hook("response", (response, event) => {
    const failed = response.status >= 300 && response.status !== 304;
    if (failed && new URL(event.req.url).pathname.startsWith("/assets/")) {
      response.headers.set("Cache-Control", "no-store");
    }
  });
});
