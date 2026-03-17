import { createFileRoute } from "@tanstack/react-router";
import { requireSession } from "@/lib/api-auth";
import { fetchImmichThumbnail, getImmichConfig } from "@/lib/immich";

const ASSET_ID_RE = /^[a-zA-Z0-9_-]+$/;

export const Route = createFileRoute("/api/immich/thumbnail/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { error } = await requireSession(request);
        if (error) {
          return error;
        }

        const { id } = params;
        if (!(id && ASSET_ID_RE.test(id))) {
          return Response.json({ error: "Invalid asset ID" }, { status: 400 });
        }

        const config = await getImmichConfig();
        if (!config) {
          return Response.json(
            { error: "Immich not configured" },
            { status: 503 }
          );
        }

        try {
          const upstream = await fetchImmichThumbnail(config, id);
          const contentType =
            upstream.headers.get("content-type") ?? "image/jpeg";

          return new Response(upstream.body, {
            status: 200,
            headers: {
              "Cache-Control": "private, max-age=86400",
              "Content-Type": contentType,
            },
          });
        } catch {
          return Response.json(
            { error: "Failed to fetch thumbnail" },
            { status: 502 }
          );
        }
      },
    },
  },
});
