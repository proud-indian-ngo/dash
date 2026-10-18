import { createFileRoute } from "@tanstack/react-router";

// The browser drops its HTTP cache for this origin on receiving this response:
// a hard refresh for devices that have no shortcut for one. Sign-in survives,
// since cookies and storage are left alone.
export const Route = createFileRoute("/api/clear-cache")({
  server: {
    handlers: {
      GET: () =>
        new Response(null, {
          headers: {
            "Cache-Control": "no-store",
            "Clear-Site-Data": '"cache"',
          },
          status: 204,
        }),
    },
  },
});
