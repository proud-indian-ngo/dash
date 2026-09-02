import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";

import { assertServerPermission, requireSession } from "@/lib/api-auth";
import {
  buildFinancialExportFilename,
  parseFinancialExportSearchParams,
} from "@/lib/financial-export-contract";
import { getS3 } from "@/lib/s3";
import {
  type FinancialExportData,
  getFinancialExportData,
} from "@/lib/server/financial-export";
import {
  buildAttachmentArchivePaths,
  createFinancialExportArchiveStream,
  type FinancialExportArchiveAttachment,
} from "@/lib/server/financial-export-archive";

interface ExportS3File {
  stat: () => Promise<unknown>;
  stream: () => ReadableStream<Uint8Array>;
}

export interface FinancialExportHandlerDependencies {
  assertPermission: typeof assertServerPermission;
  getData: typeof getFinancialExportData;
  getS3: () => { file: (key: string) => ExportS3File };
  getSession: typeof requireSession;
  now: () => Date;
}

const defaultDependencies: FinancialExportHandlerDependencies = {
  assertPermission: assertServerPermission,
  getData: getFinancialExportData,
  getS3,
  getSession: requireSession,
  now: () => new Date(),
};

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runWorker = async (): Promise<void> => {
    const index = nextIndex;
    nextIndex += 1;
    const item = items[index];
    if (item === undefined) {
      return;
    }
    results[index] = await mapper(item);
    await runWorker();
  };
  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => runWorker()
  );
  await Promise.all(workers);
  return results;
}

async function preflightAttachments(
  data: FinancialExportData,
  s3: ReturnType<FinancialExportHandlerDependencies["getS3"]>
): Promise<FinancialExportArchiveAttachment[]> {
  const paths = buildAttachmentArchivePaths(data.attachments);
  return await mapWithConcurrency(paths, 8, async ({ attachment, path }) => {
    const file = s3.file(attachment.objectKey);
    await file.stat();
    return { path, stream: file.stream() };
  });
}

export async function handleFinancialExportRequest(
  request: Request,
  dependencies: FinancialExportHandlerDependencies = defaultDependencies
): Promise<Response> {
  const authResult = await dependencies.getSession(request);
  if (authResult.error) {
    return authResult.error;
  }
  const url = new URL(request.url);
  const parsed = parseFinancialExportSearchParams(url.searchParams);
  if (!parsed.success) {
    return Response.json(
      { error: "Invalid financial export options" },
      { status: 400 }
    );
  }
  try {
    await dependencies.assertPermission(authResult.session, "requests.export");
  } catch {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const input = parsed.data;
  const log = createRequestLogger({
    method: "GET",
    path: "/api/financial-export",
  });
  log.set({
    fyStart: input.fyStart,
    handler: "handleFinancialExportRequest",
    includeTransactions: input.includeTransactions,
    includeVendorPayments: input.includeVendorPayments,
    requestStatuses: input.requestStatuses,
    requestTypes: input.requestTypes,
    userId: authResult.session.user.id,
    vendorPaymentStatuses: input.vendorPaymentStatuses,
  });

  try {
    const today = dependencies.now().toISOString().slice(0, 10);
    const data = await dependencies.getData(input, url.origin, today);
    const attachments = await preflightAttachments(data, dependencies.getS3());
    const stream = createFinancialExportArchiveStream(
      data.csvFiles,
      attachments,
      (error) => {
        const streamLog = createRequestLogger({
          method: "GET",
          path: "/api/financial-export",
        });
        streamLog.set({
          attachmentCount: attachments.length,
          event: "financial_export_stream_failed",
          fyStart: input.fyStart,
          userId: authResult.session.user.id,
        });
        streamLog.error(error instanceof Error ? error : String(error));
        streamLog.emit();
      }
    );
    log.set({
      attachmentCount: attachments.length,
      csvFileCount: data.csvFiles.length,
      requestCount: data.requestCount,
      transactionCount: data.transactionCount,
      vendorPaymentCount: data.vendorPaymentCount,
    });
    log.emit();
    return new Response(stream, {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        "Content-Disposition": `attachment; filename="${buildFinancialExportFilename(input.fyStart, today)}"`,
        "Content-Type": "application/zip",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
        "X-Export-Request-Count": String(data.requestCount),
        "X-Export-Transaction-Count": String(data.transactionCount),
        "X-Export-Vendor-Payment-Count": String(data.vendorPaymentCount),
      },
    });
  } catch (error) {
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return Response.json(
      { error: "Financial export could not be generated" },
      { status: 500 }
    );
  }
}

export const Route = createFileRoute("/api/financial-export")({
  server: {
    handlers: {
      GET: ({ request }) => handleFinancialExportRequest(request),
    },
  },
});
