import {
  certificateFileName,
  loadCertificateFile,
  loadFilingHeader,
} from "@pi-dash/db/queries/donation-filings";
import { createRequestLogger } from "evlog";
import { z } from "zod";

import { assertServerPermission, requireSession } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { getS3 } from "@/lib/s3";
import { safeErrorName } from "@/lib/safe-errors";

/**
 * Downloads of a filing's stored files. Both carry donors' full ID numbers,
 * so they need `finance.view_sensitive` and every fetch is audited as a
 * download, as revealing an identifier is. `?disposition=inline` opens the
 * file in the viewer instead; that still counts as a download.
 */

interface StoredFile {
  contentType: string;
  fileName: string;
  objectKey: string;
}

export interface FilingDownloadDependencies {
  assertPermission: typeof assertServerPermission;
  audit: typeof runSessionAuditedAction;
  getSession: typeof requireSession;
  readObject: (objectKey: string) => Promise<ArrayBuffer | null>;
}

const defaults: FilingDownloadDependencies = {
  assertPermission: assertServerPermission,
  audit: runSessionAuditedAction,
  getSession: requireSession,
  readObject: async (objectKey) => {
    const file = getS3().file(objectKey);
    if (!(await file.exists())) {
      return null;
    }
    return await file.arrayBuffer();
  },
};

async function handleDownload(
  request: Request,
  idParam: string,
  options: {
    action: "donation_filing.download" | "donation_certificate.download";
    find: (id: string) => Promise<StoredFile | null>;
    targetType: "donation_filing" | "donation_certificate";
  },
  deps: FilingDownloadDependencies
): Promise<Response> {
  const id = z.uuid().safeParse(idParam);
  if (!id.success) {
    return Response.json({ error: "Invalid file" }, { status: 400 });
  }
  const result = await deps.getSession(request);
  if (result.error) {
    return result.error;
  }
  const { session } = result;
  try {
    await deps.assertPermission(session, "finance.view_sensitive");
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const found = await deps.audit(
      session,
      request.headers,
      {
        action: options.action,
        target: { id: id.data, type: options.targetType },
      },
      async () => {
        const file = await options.find(id.data);
        const bytes = file ? await deps.readObject(file.objectKey) : null;
        return file && bytes ? { bytes, file } : null;
      },
      // Nothing was revealed for a file that doesn't exist.
      (value) => (value ? undefined : "failure")
    );
    if (!found) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const disposition =
      new URL(request.url).searchParams.get("disposition") === "inline"
        ? "inline"
        : "attachment";
    return new Response(found.bytes, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `${disposition}; filename="${found.file.fileName}"`,
        "Content-Type": found.file.contentType,
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const log = createRequestLogger({ method: "GET", path: options.action });
    log.set({
      errorName: safeErrorName(error),
      event: "donation_filing_download_failed",
      targetId: id.data,
      userId: session.user.id,
    });
    log.error(new Error("Filing download failed"));
    log.emit();
    return Response.json(
      { error: "The file couldn't be downloaded." },
      { status: 500 }
    );
  }
}

export function handleFilingFileDownload(
  request: Request,
  filingId: string,
  deps: FilingDownloadDependencies = defaults
): Promise<Response> {
  return handleDownload(
    request,
    filingId,
    {
      action: "donation_filing.download",
      find: async (id) => {
        const filing = await loadFilingHeader(id);
        return filing
          ? {
              contentType: "text/csv; charset=utf-8",
              fileName: filing.fileName,
              objectKey: filing.fileObjectKey,
            }
          : null;
      },
      targetType: "donation_filing",
    },
    deps
  );
}

export function handleCertificateDownload(
  request: Request,
  certificateId: string,
  deps: FilingDownloadDependencies = defaults
): Promise<Response> {
  return handleDownload(
    request,
    certificateId,
    {
      action: "donation_certificate.download",
      find: async (id) => {
        const certificate = await loadCertificateFile(id);
        return certificate
          ? {
              contentType: "application/pdf",
              fileName: certificateFileName(certificate.acknowledgementNumber),
              objectKey: certificate.fileObjectKey,
            }
          : null;
      },
      targetType: "donation_certificate",
    },
    deps
  );
}
