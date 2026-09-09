import type { Plugin } from "vite";

const API_PATH = /^\/api\//;
const MEDIA_DESTINATIONS = new Set(["image", "audio", "video"]);

// Nitro's dev asset detection otherwise bypasses the API catchall for native
// media elements. Only normalize routing; the API still authorizes each request.
export const apiMediaDevMiddleware: Plugin = {
  apply: "serve",
  configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      const destination = request.headers["sec-fetch-dest"];
      if (
        request.url &&
        API_PATH.test(request.url) &&
        typeof destination === "string" &&
        MEDIA_DESTINATIONS.has(destination)
      ) {
        request.headers["sec-fetch-dest"] = "empty";
      }
      next();
    });
  },
  enforce: "pre",
  name: "api-media-dev-middleware",
};
