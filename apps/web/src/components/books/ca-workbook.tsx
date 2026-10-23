import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";

import { exportCaWorkbook } from "@/functions/books";

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function saveBase64(base64: string, filename: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: XLSX_TYPE }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Why the workbook can't be downloaded for a year yet; null when it can. */
export function caWorkbookBlocker(input: {
  openingPosted: boolean;
  startsBeforeCutover: boolean;
}): string | null {
  if (input.startsBeforeCutover) {
    return "The books start in FY 2026-27";
  }
  if (!input.openingPosted) {
    return "Post the opening balances first";
  }
  return null;
}

/**
 * The menu label, with the reason underneath when it is unavailable. The
 * audit pack holds the workbook, so it shares the label and the reason.
 */
export function CaWorkbookLabel({
  blocker,
  text = "Download CA workbook (XLSX)",
}: {
  blocker: string | null;
  text?: string;
}) {
  return (
    <span className="flex flex-col">
      <span>{text}</span>
      {blocker ? (
        <span className="text-muted-foreground text-xs">{blocker}</span>
      ) : null}
    </span>
  );
}

/** Downloads the CA handoff workbook for a year. */
export function useCaWorkbookDownload() {
  const run = useServerFn(exportCaWorkbook);
  const [downloading, setDownloading] = useState(false);
  const download = useEventCallback(async (fiscalYearId: string) => {
    setDownloading(true);
    await run({ data: { fiscalYearId } })
      .then((file) => {
        saveBase64(file.base64, file.filename);
        toast.success("CA workbook downloaded");
      })
      .catch((error: unknown) => {
        log.error({
          action: "books.caWorkbook.export",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "BooksPage",
        });
        toast.error("Couldn't build the CA workbook", {
          description:
            error instanceof Error ? error.message : "Something went wrong",
        });
      })
      .finally(() => setDownloading(false));
  });
  return { download, downloading };
}
