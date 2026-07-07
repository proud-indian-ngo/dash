import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";
import { requireSession } from "@/lib/api-auth";
import { fetchImmichThumbnail, getImmichConfig } from "@/lib/immich";

const ASSET_ID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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
            headers: {
              "Cache-Control": "private, max-age=86400",
              "Content-Type": contentType,
            },
            status: 200,
          });
        } catch (caughtError) {
          const log = createRequestLogger({
            method: "GET",
            path: "/api/immich/thumbnail",
          });
          log.set({ assetId: id });
          log.error(
            caughtError instanceof Error ? caughtError : String(caughtError)
          );
          log.emit();
          return Response.json(
            { caughtError: "Failed to fetch thumbnail" },
            { status: 502 }
          );
        }
      },
    },
  },
});
