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

const MAX_XID8 = 18_446_744_073_709_551_615n;
const MAX_PG_SNAPSHOT_LENGTH = 16_384;
const MAX_PG_SNAPSHOT_ACTIVE_XIDS = 1024;
const PG_XID_PATTERN = /^\d+$/;
const PG_ACTIVE_XIDS_PATTERN = /^\d+(?:,\d+)*$/;

function isValidPgSnapshot(value: string) {
  if (value.length > MAX_PG_SNAPSHOT_LENGTH) {
    return false;
  }
  const parts = value.split(":");
  if (parts.length !== 3) {
    return false;
  }
  const [xminText, xmaxText, activeText] = parts;
  if (!(xminText && xmaxText) || activeText === undefined) {
    return false;
  }
  if (!(PG_XID_PATTERN.test(xminText) && PG_XID_PATTERN.test(xmaxText))) {
    return false;
  }
  if (activeText !== "" && !PG_ACTIVE_XIDS_PATTERN.test(activeText)) {
    return false;
  }
  const activeIds = activeText ? activeText.split(",") : [];
  if (activeIds.length > MAX_PG_SNAPSHOT_ACTIVE_XIDS) {
    return false;
  }
  const xmin = BigInt(xminText);
  const xmax = BigInt(xmaxText);
  if (xmin > xmax || xmax > MAX_XID8) {
    return false;
  }
  let previous: bigint | null = null;
  for (const activeIdText of activeIds) {
    const activeId = BigInt(activeIdText);
    if (
      activeId < xmin ||
      activeId >= xmax ||
      (previous !== null && activeId <= previous)
    ) {
      return false;
    }
    previous = activeId;
  }
  return true;
}

const querySchema = z.strictObject({
  domain: z.enum(KALAKRITI_AUDIT_DOMAINS).nullable(),
  limit: z.number().int().min(10).max(100),
  offset: z.number().int().min(0),
  snapshotVersion: z
    .string()
    .max(MAX_PG_SNAPSHOT_LENGTH)
    .refine(isValidPgSnapshot)
    .nullable(),
});

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
  if (!year.success) {
    return Response.json({ error: "Invalid audit query" }, { status: 400 });
  }

  const { session, error } = await deps.getSession(request);
  if (error) {
    return error;
  }
  const query = parseQuery(request);
  if (!query.success) {
    return Response.json({ error: "Invalid audit query" }, { status: 400 });
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
  return Response.json(
    {
      ...page,
      allowedDomains: scope.domains,
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Cookie",
      },
    }
  );
}

export const Route = createFileRoute("/api/kalakriti/$year/audit")({
  server: {
    handlers: {
      GET: ({ params, request }) =>
        handleKalakritiAuditRequest(request, params.year),
    },
  },
});
