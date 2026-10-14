import { defineEventHandler } from "nitro/h3";

// Real build assets are served by Nitro's static handler before any server
// middleware runs, so a request that reaches here asks for a chunk this build
// does not have (usually a tab or a container from another deploy). Answer
// with a 404 instead of falling through to the app routes, which would send
// a login redirect or HTML page where the browser expects JavaScript. The
// `asset-cache` plugin keeps this 404 out of the immutable asset cache.
export default defineEventHandler((event) => {
  if (!event.url.pathname.startsWith("/assets/")) {
    return;
  }
  // Returning here skips the security-headers middleware.
  event.res.headers.set("Content-Type", "text/plain; charset=utf-8");
  event.res.headers.set("X-Content-Type-Options", "nosniff");
  event.res.status = 404;
  return "Not found";
});
