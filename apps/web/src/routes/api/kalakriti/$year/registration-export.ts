// biome-ignore-all lint/style/useFilenamingConvention: TanStack dynamic route parameters use $ in filenames.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import {
  buildKalakritiRegistrationCsvArchive,
  type KalakritiRegistrationExportData,
} from "@/lib/kalakriti-registration-export";
import type { KalakritiRegistrationScope } from "@/lib/kalakriti-registration-scope-policy";
import { getKalakritiRegistrationExport } from "@/lib/server/kalakriti-registration-export";
import { resolveKalakritiRegistrationScope } from "@/lib/server/kalakriti-registration-scope";

export interface RegistrationExportHandlerDependencies {
  buildArchive: typeof buildKalakritiRegistrationCsvArchive;
  getExport: (input: {
    editionId: string;
    scopes: readonly KalakritiRegistrationScope[];
  }) => Promise<KalakritiRegistrationExportData>;
  getSession: typeof requireSession;
  resolveScope: typeof resolveKalakritiRegistrationScope;
}

const defaultDependencies: RegistrationExportHandlerDependencies = {
  buildArchive: buildKalakritiRegistrationCsvArchive,
  getExport: getKalakritiRegistrationExport,
  getSession: requireSession,
  resolveScope: resolveKalakritiRegistrationScope,
};

export async function handleKalakritiRegistrationExportRequest(
  request: Request,
  yearParam: string,
  dependencies: RegistrationExportHandlerDependencies = defaultDependencies
) {
  const year = z.coerce.number().int().min(2000).max(2200).safeParse(yearParam);
  if (!year.success) {
    return Response.json({ error: "Invalid year" }, { status: 400 });
  }
  const result = await dependencies.getSession(request);
  if (result.error) {
    return result.error;
  }
  const resolved = await dependencies.resolveScope({
    sessionUser: result.session.user,
    year: year.data,
  });
  if (!resolved) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (resolved.scopes.length === 0) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const data = await dependencies.getExport(resolved);
  const archive = dependencies.buildArchive(year.data, data);
  return new Response(new Blob([archive]).stream(), {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `attachment; filename="kalakriti-${year.data}-registration.zip"`,
      "Content-Type": "application/zip",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const Route = createFileRoute(
  "/api/kalakriti/$year/registration-export"
)({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        handleKalakritiRegistrationExportRequest(request, params.year),
    },
  },
});
