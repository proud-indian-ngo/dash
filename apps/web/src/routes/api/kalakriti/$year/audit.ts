// biome-ignore-all lint/style/useFilenamingConvention: TanStack dynamic route parameters use $ in filenames.
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { requireSession } from "@/lib/api-auth";
import {
  KALAKRITI_AUDIT_DOMAINS,
  resolveKalakritiAuditScope,
} from "@/lib/kalakriti-audit-policy";
import {
  getKalakritiAuditPage,
  type KalakritiAuditPageInput,
} from "@/lib/server/kalakriti-audit";
import { resolveKalakritiEditionAccess } from "@/lib/server/kalakriti-edition-access";

const querySchema = z
  .object({
    domain: z.enum(KALAKRITI_AUDIT_DOMAINS).nullable(),
    limit: z.number().int().min(10).max(100),
    offset: z.number().int().min(0),
    snapshotVersion: z
      .string()
      .regex(/^\d+:\d+:(?:\d+(?:,\d+)*)?$/)
      .nullable(),
  })
  .strict();

export interface AuditHandlerDeps {
  getAccess: (input: {
    role: string;
    userId: string;
    year: number;
  }) => Promise<KalakritiEditionAccess | null>;
  getPage: (input: KalakritiAuditPageInput) => Promise<{
    items: unknown[];
    snapshotVersion: string;
    total: number;
  } | null>;
  getSession: (request: Request) => Promise<
    | { error: Response; session?: never }
    | {
        error?: never;
        session: { user: { id: string; role?: string | null } };
      }
  >;
}

const defaultDeps: AuditHandlerDeps = {
  getAccess: resolveKalakritiEditionAccess,
  getPage: getKalakritiAuditPage,
  getSession: requireSession,
};

function parseQuery(request: Request) {
  const url = new URL(request.url);
  return querySchema.safeParse({
    domain: url.searchParams.get("domain"),
    limit: Number(url.searchParams.get("limit") ?? 25),
    offset: Number(url.searchParams.get("offset") ?? 0),
    snapshotVersion: url.searchParams.get("snapshotVersion"),
  });
}

export async function handleKalakritiAuditRequest(
  request: Request,
  yearParam: string,
  deps: AuditHandlerDeps = defaultDeps
) {
  const year = z.coerce.number().int().min(2000).max(2200).safeParse(yearParam);
  const query = parseQuery(request);
  if (!(year.success && query.success)) {
    return Response.json({ error: "Invalid audit query" }, { status: 400 });
  }

  const { session, error } = await deps.getSession(request);
  if (error) {
    return error;
  }
  const access = await deps.getAccess({
    role: session.user.role ?? "unoriented_volunteer",
    userId: session.user.id,
    year: year.data,
  });
  if (!access) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const scope = resolveKalakritiAuditScope(access);
  if (!scope) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const page = await deps.getPage({
    domain: query.data.domain,
    editionId: access.edition.id,
    limit: query.data.limit,
    offset: query.data.offset,
    scope,
    snapshotVersion: query.data.snapshotVersion,
  });
  if (!page) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return Response.json({
    ...page,
    allowedDomains: scope.domains,
  });
}

export const Route = createFileRoute("/api/kalakriti/$year/audit")({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        handleKalakritiAuditRequest(request, params.year),
    },
  },
});
