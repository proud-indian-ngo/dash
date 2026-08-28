// biome-ignore-all lint/style/useFilenamingConvention: TanStack dynamic route parameters use $ in filenames.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { requireSession } from "@/lib/api-auth";
import { classifyAuditResponse, runSessionAuditedAction } from "@/lib/audit";
import {
  canManageKalakritiCredentials,
  printKalakritiCredentials,
} from "@/lib/server/kalakriti-credential";
import { resolveKalakritiEditionAccess } from "@/lib/server/kalakriti-edition-access";

const printBodySchema = z.object({
  subjects: z
    .array(
      z
        .object({
          membershipId: z.string().optional(),
          studentId: z.string().optional(),
        })
        .refine(
          (value) => Boolean(value.studentId) !== Boolean(value.membershipId),
          { message: "Exactly one credential subject is required" }
        )
    )
    .min(1)
    .max(100),
});

export async function handleKalakritiCredentialPrintRequest(
  request: Request,
  yearParam: string
) {
  const year = z.coerce.number().int().min(2000).max(2200).safeParse(yearParam);
  if (!year.success) {
    return Response.json({ error: "Invalid year" }, { status: 400 });
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
  if (!(access && canManageKalakritiCredentials(access))) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  return runSessionAuditedAction(
    sessionResult.session,
    request.headers,
    {
      action: "kalakriti.credential.print",
      target: { id: access.edition.id, type: "kalakriti_edition" },
    },
    async () => {
      const body = printBodySchema.safeParse(await request.json());
      if (!body.success) {
        return Response.json({ error: "Invalid request" }, { status: 400 });
      }
      try {
        const pdf = await printKalakritiCredentials({
          actorUserId: sessionResult.session.user.id,
          editionId: access.edition.id,
          editionLabel: access.edition.name,
          now: Date.now(),
          subjects: body.data.subjects,
        });
        return new Response(new Blob([new Uint8Array(pdf)]).stream(), {
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
            "Content-Disposition": `attachment; filename="kalakriti-${year.data}-credentials.pdf"`,
            "Content-Type": "application/pdf",
            Vary: "Cookie",
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Print failed";
        if (message.includes("not allowed")) {
          return Response.json({ error: message }, { status: 403 });
        }
        if (message.includes("not found")) {
          return Response.json({ error: message }, { status: 404 });
        }
        return Response.json({ error: message }, { status: 400 });
      }
    },
    classifyAuditResponse
  );
}

export const Route = createFileRoute("/api/kalakriti/$year/credentials/print")({
  server: {
    handlers: {
      POST: ({ params, request }) =>
        handleKalakritiCredentialPrintRequest(request, params.year),
    },
  },
});
