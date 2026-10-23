import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { getCertificate } from "@pi-dash/db/queries/utilisation-certificates";
import { createRequestLogger } from "evlog";
import { z } from "zod";

import { requireSession } from "@/lib/api-auth";
import { runSessionAuditedAction } from "@/lib/audit";
import { safeFileName } from "@/lib/governance/vault";
import { getS3 } from "@/lib/s3";
import { safeErrorName } from "@/lib/safe-errors";

/**
 * A utilisation certificate's files: `?file=latest` (the latest copy, as
 * prepared or with every signature so far) or `?file=ca` (the CA's
 * document). Finance readers get both; the two signing trustees get the
 * latest copy of the certificate they sign. Every fetch is audited as a
 * download, `?disposition=inline` (the viewer) included.
 */

/**
 * A PDF's name as it is kept and served: ASCII letters, digits, dots,
 * dashes and underscores (`safeFileName`), so it fits a Content-Disposition
 * header as it is. A name without a letter or digit left (one in Hindi)
 * becomes "ca-certificate.pdf".
 */
export function certificatePdfName(name: string): string {
  const stem = safeFileName(name.replace(/\.pdf$/i, ""));
  const named = stem !== "document" && /[A-Za-z0-9]/.test(stem);
  return `${named ? stem : "ca-certificate"}.pdf`;
}

export interface CertificateDownloadDependencies {
  audit: typeof runSessionAuditedAction;
  findCertificate: typeof getCertificate;
  getSession: typeof requireSession;
  permissionsOf: (role: string) => Promise<string[]>;
  readObject: (objectKey: string) => Promise<ArrayBuffer | null>;
}

const defaults: CertificateDownloadDependencies = {
  audit: runSessionAuditedAction,
  findCertificate: (id) => getCertificate(id),
  getSession: requireSession,
  permissionsOf: resolvePermissions,
  readObject: async (objectKey) => {
    const file = getS3().file(objectKey);
    if (!(await file.exists())) {
      return null;
    }
    return await file.arrayBuffer();
  },
};

export async function handleCertificateFileDownload(
  request: Request,
  idParam: string,
  deps: CertificateDownloadDependencies = defaults
): Promise<Response> {
  const id = z.uuid().safeParse(idParam);
  const url = new URL(request.url);
  const which = z
    .enum(["latest", "ca"])
    .safeParse(url.searchParams.get("file"));
  if (!(id.success && which.success)) {
    return Response.json({ error: "Invalid file" }, { status: 400 });
  }
  const result = await deps.getSession(request);
  if (result.error) {
    return result.error;
  }
  const { session } = result;
  const certificate = await deps.findCertificate(id.data);
  const financeReader = (
    await deps.permissionsOf(session.user.role ?? "unoriented_volunteer")
  ).includes("finance.view");
  const signer =
    which.data === "latest" &&
    !!certificate &&
    (certificate.headUserId === session.user.id ||
      certificate.financeUserId === session.user.id);
  if (!(financeReader || signer)) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  const objectKey =
    which.data === "latest"
      ? certificate?.latestObjectKey
      : certificate?.caObjectKey;
  const fileName =
    which.data === "latest"
      ? `${(certificate?.number ?? "certificate").replaceAll("/", "-")}.pdf`
      : certificatePdfName(certificate?.caFilename ?? "");
  try {
    const bytes = await deps.audit(
      session,
      request.headers,
      {
        action: "utilisation_certificate.download",
        metadata: { file: which.data },
        target: { id: id.data, type: "utilisation_certificate" },
      },
      async () => (objectKey ? await deps.readObject(objectKey) : null),
      // Nothing was handed out for a file that doesn't exist.
      (value) => (value ? undefined : "failure")
    );
    if (!bytes) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const disposition =
      url.searchParams.get("disposition") === "inline"
        ? "inline"
        : "attachment";
    return new Response(bytes, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `${disposition}; filename="${fileName}"`,
        "Content-Type": "application/pdf",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const log = createRequestLogger({
      method: "GET",
      path: "/api/utilisation-certificates",
    });
    log.set({
      errorName: safeErrorName(error),
      event: "utilisation_certificate_download_failed",
      targetId: id.data,
      userId: session.user.id,
    });
    log.error(new Error("Utilisation certificate download failed"));
    log.emit();
    return Response.json(
      { error: "The file couldn't be downloaded." },
      { status: 500 }
    );
  }
}
