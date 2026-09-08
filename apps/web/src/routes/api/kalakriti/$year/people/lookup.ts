// biome-ignore-all lint/style/useFilenamingConvention: TanStack dynamic route parameters use $ in filenames.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { requireSession } from "@/lib/api-auth";
import { resolveKalakritiEditionAccess } from "@/lib/server/kalakriti-edition-access";
import {
  canLookupKalakritiPerson,
  lookupKalakritiPerson,
} from "@/lib/server/kalakriti-person-lookup";

export async function handleKalakritiPersonLookupRequest(
  request: Request,
  yearParam: string
) {
  const year = z.coerce.number().int().min(2000).max(2200).safeParse(yearParam);
  if (!year.success) {
    return Response.json({ error: "Invalid year" }, { status: 400 });
  }
  const humanId = new URL(request.url).searchParams.get("humanId")?.trim();
  if (!humanId) {
    return Response.json({ error: "humanId is required" }, { status: 400 });
  }
  const sessionResult = await requireSession(request);
  if (sessionResult.error) {
    return sessionResult.error;
  }
  const access = await resolveKalakritiEditionAccess({
    role: sessionResult.session.user.role ?? "unoriented_volunteer",
    userId: sessionResult.session.user.id,
    year: year.data,
  });
  if (!(access && canLookupKalakritiPerson(access))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const result = await lookupKalakritiPerson({
    editionId: access.edition.id,
    humanId,
  });
  if (!result) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return Response.json(result, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
    },
  });
}

export const Route = createFileRoute("/api/kalakriti/$year/people/lookup")({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        handleKalakritiPersonLookupRequest(request, params.year),
    },
  },
});
