import { BrailleSpinner } from "@pi-dash/design-system/components/braille-spinner";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useRef, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shared/responsive-alert-dialog";
import { prepareAuditPack } from "@/functions/books";

interface PackYear {
  id: string;
  label: string;
}

/** Hands the prepared pack to the browser's own download, which streams to disk. */
function startDownload(token: string) {
  const link = document.createElement("a");
  link.href = `/api/audit-pack?token=${encodeURIComponent(token)}`;
  document.body.append(link);
  link.click();
  link.remove();
}

/**
 * Books → Download audit pack (ZIP): confirm, prepare on the server (the
 * slow part, cancellable), then download natively.
 */
export function useAuditPackDownload() {
  const prepare = useServerFn(prepareAuditPack);
  const [year, setYear] = useState<PackYear | null>(null);
  const [preparing, setPreparing] = useState(false);
  const abort = useRef<AbortController | null>(null);

  const close = useEventCallback(() => {
    abort.current?.abort();
    abort.current = null;
    setPreparing(false);
    setYear(null);
  });

  const confirm = useEventCallback(async () => {
    if (!year) {
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setPreparing(true);
    try {
      const { token } = await prepare({
        data: { fiscalYearId: year.id },
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        return;
      }
      startDownload(token);
      toast.success("Audit pack download started");
      close();
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      const message =
        error instanceof Error ? error.message : "Something went wrong";
      log.error({
        action: "books.auditPack.prepare",
        caughtError: message,
        component: "BooksPage",
      });
      toast.error("Couldn't build the audit pack", { description: message });
      setPreparing(false);
    }
  });

  return { close, confirm, open: setYear, preparing, year };
}

export function AuditPackDialog({
  action,
}: {
  action: ReturnType<typeof useAuditPackDownload>;
}) {
  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) {
          action.close();
        }
      }}
      open={action.year !== null}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Download the audit pack for FY {action.year?.label ?? ""}
          </AlertDialogTitle>
          <AlertDialogDescription>
            The CA workbook with every stored bill, invoice, payment proof,
            receipt, filing, certificate and grant agreement behind it. It holds
            full ID numbers and bank details, and your download is recorded in
            the audit log.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {/* Stays enabled while preparing: cancelling stops the server's work. */}
          <AlertDialogCancel size="default" variant="outline">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={action.preparing}
            onClick={action.confirm}
          >
            {action.preparing ? (
              <>
                <BrailleSpinner variant="inline" />
                Building audit pack...
              </>
            ) : (
              "Download audit pack"
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
