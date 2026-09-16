import { generateBlankKalakritiIdCards } from "@pi-dash/pdf/generate-blank-kalakriti-id-cards.tsx";
import { generateKalakritiIdCards } from "@pi-dash/pdf/generate-kalakriti-id-cards.tsx";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";
import { z } from "zod";

import { requireSession } from "@/lib/api-auth";
import { blankIdCardPagesSchema } from "@/lib/kalakriti-blank-id-cards";
import { resolveKalakritiEditionAccess } from "@/lib/server/kalakriti-edition-access";
import { getKalakritiIdCardData } from "@/lib/server/kalakriti-id-card-data";

export interface IdCardExportDependencies {
  getSession: typeof requireSession;
  resolveAccess: typeof resolveKalakritiEditionAccess;
  getPeople: typeof getKalakritiIdCardData;
  generatePdf: typeof generateKalakritiIdCards;
  generateBlankPdf: typeof generateBlankKalakritiIdCards;
}

const defaults: IdCardExportDependencies = {
  getSession: requireSession,
  resolveAccess: resolveKalakritiEditionAccess,
  getPeople: getKalakritiIdCardData,
  generatePdf: generateKalakritiIdCards,
  generateBlankPdf: generateBlankKalakritiIdCards,
};

export async function handleKalakritiIdCards(
  request: Request,
  yearParam: string,
  deps: IdCardExportDependencies = defaults
) {
  const year = z.coerce.number().int().min(2000).max(2200).safeParse(yearParam);
  if (!year.success)
    return Response.json({ error: "Invalid year" }, { status: 400 });
  const result = await deps.getSession(request);
  if (result.error) return result.error;
  const access = await deps.resolveAccess({
    role: result.session.user.role ?? "unoriented_volunteer",
    userId: result.session.user.id,
    year: year.data,
  });
  if (!access) return Response.json({ error: "Not found" }, { status: 404 });
  if (
    !(
      access.isGlobalAdmin ||
      access.membership?.responsibilities.includes("edition_admin")
    )
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const log = createRequestLogger({
    method: "GET",
    path: "/api/kalakriti/$year/id-cards",
  });
  log.set({
    handler: "kalakritiIdCards",
    userId: result.session.user.id,
    editionId: access.edition.id,
    year: year.data,
  });
  try {
    const params = new URL(request.url).searchParams;
    const blank = params.get("mode") === "blank";
    let pdf: Buffer;
    if (blank) {
      const pages = blankIdCardPagesSchema.safeParse({
        volunteerPages: Number(params.get("volunteerPages") ?? 0),
        guestPages: Number(params.get("guestPages") ?? 0),
        judgePages: Number(params.get("judgePages") ?? 0),
      });
      if (!pages.success)
        return Response.json(
          {
            error: "Choose whole page counts totaling between 1 and 100 pages.",
          },
          { status: 400 }
        );
      log.set({ mode: "blank", ...pages.data });
      pdf = await deps.generateBlankPdf(pages.data);
    } else {
      const people = await deps.getPeople(access.edition.id);
      log.set({ personCount: people.length });
      if (people.length === 0)
        return Response.json(
          { error: "There are no people to print for this edition" },
          { status: 422 }
        );
      pdf = await deps.generatePdf(people);
    }
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="kalakriti-${year.data}-${blank ? "blank-" : ""}id-cards.pdf"`,
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    log.error(error instanceof Error ? error : String(error));
    return Response.json(
      {
        error:
          "ID cards could not be generated. Check that names and competition lists fit the card layout.",
      },
      { status: 500 }
    );
  } finally {
    log.emit();
  }
}

export const Route = createFileRoute("/api/kalakriti/$year/id-cards")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        handleKalakritiIdCards(request, params.year),
    },
  },
});
