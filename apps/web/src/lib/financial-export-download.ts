import {
  buildFinancialExportFilename,
  buildFinancialExportUrl,
  type FinancialExportInput,
} from "./financial-export-contract";

const CONTENT_DISPOSITION_FILENAME = /filename="([^"\r\n]+)"/;

export interface FinancialExportDownloadResult {
  requestCount: number;
  transactionCount: number;
  vendorPaymentCount: number;
}

interface FinancialExportDownloadDependencies {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  now: () => Date;
  saveBlob: (blob: Blob, filename: string) => void;
}

const saveBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

const defaultDependencies: FinancialExportDownloadDependencies = {
  fetch: (input, init) => globalThis.fetch(input, init),
  now: () => new Date(),
  saveBlob,
};

const parseCountHeader = (response: Response, name: string): number => {
  const value = Number(response.headers.get(name) ?? 0);
  return Number.isFinite(value) ? value : 0;
};

const getResponseFilename = (response: Response, fallback: string): string => {
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(CONTENT_DISPOSITION_FILENAME);
  return match?.[1] ?? fallback;
};

async function getResponseError(response: Response): Promise<string> {
  if (response.headers.get("content-type")?.includes("application/json")) {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string") {
      return body.error;
    }
  }
  return `Financial export failed (${response.status})`;
}

export async function downloadFinancialExport(
  input: FinancialExportInput,
  dependencies: FinancialExportDownloadDependencies = defaultDependencies
): Promise<FinancialExportDownloadResult> {
  const response = await dependencies.fetch(buildFinancialExportUrl(input));
  if (!response.ok) {
    throw new Error(await getResponseError(response));
  }
  const today = dependencies.now().toISOString().slice(0, 10);
  dependencies.saveBlob(
    await response.blob(),
    getResponseFilename(
      response,
      buildFinancialExportFilename(input.fyStart, today)
    )
  );
  return {
    requestCount: parseCountHeader(response, "X-Export-Request-Count"),
    transactionCount: parseCountHeader(response, "X-Export-Transaction-Count"),
    vendorPaymentCount: parseCountHeader(
      response,
      "X-Export-Vendor-Payment-Count"
    ),
  };
}
