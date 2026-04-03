import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";
import { requireSession } from "@/lib/api-auth";
import { fetchImmichOriginal, getImmichConfig } from "@/lib/immich";

const ASSET_ID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const Route = createFileRoute("/api/immich/original/$id")({
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
          const upstream = await fetchImmichOriginal(config, id);
          const contentType =
            upstream.headers.get("content-type") ?? "image/jpeg";
          const headers: HeadersInit = {
            "Cache-Control": "private, max-age=86400",
            "Content-Type": contentType,
          };
          const contentLength = upstream.headers.get("content-length");
          if (contentLength) {
            headers["Content-Length"] = contentLength;
          }

          return new Response(upstream.body, { status: 200, headers });
        } catch (error) {
          const log = createRequestLogger({
            method: "GET",
            path: "/api/immich/original",
          });
          log.set({ assetId: id });
          log.error(error instanceof Error ? error : String(error));
          log.emit();
          return Response.json(
            { error: "Failed to fetch original image" },
            { status: 502 }
          );
        }
      },
    },
  },
});
