import { log } from "evlog";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import {
  getResponseError,
  getResponseFilename,
  saveBlob,
} from "@/lib/financial-export-download";

interface PackYear {
  id: string;
  label: string;
}

async function downloadAuditPack(year: PackYear) {
  const response = await fetch(
    `/api/audit-pack?fiscalYearId=${encodeURIComponent(year.id)}`
  );
  if (!response.ok) {
    throw new Error(await getResponseError(response, "The audit pack"));
  }
  saveBlob(
    await response.blob(),
    getResponseFilename(response, `proud-indian-audit-pack-${year.label}.zip`)
  );
}

/** Books → Download audit pack: confirm, then download the year's ZIP. */
export function useAuditPackDownload() {
  return useConfirmAction<PackYear>({
    onConfirm: async (year) => {
      try {
        await downloadAuditPack(year);
        toast.success("Audit pack downloaded");
        return { type: "success" };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Something went wrong";
        log.error({
          action: "books.auditPack.download",
          caughtError: message,
          component: "BooksPage",
        });
        return { error: { message }, type: "error" };
      }
    },
    onError: (message) => {
      toast.error("Couldn't build the audit pack", { description: message });
    },
  });
}

export function AuditPackDialog({
  action,
}: {
  action: ReturnType<typeof useAuditPackDownload>;
}) {
  return (
    <ConfirmDialog
      confirmLabel="Download audit pack"
      description={
        <>
          The CA workbook with every stored bill, invoice, payment proof,
          receipt, filing and certificate behind it. It holds full ID numbers
          and bank details, and your download is recorded in the audit log.
        </>
      }
      loading={action.isLoading}
      loadingLabel="Building audit pack..."
      onConfirm={action.confirm}
      onOpenChange={(open) => {
        if (!open) {
          action.cancel();
        }
      }}
      open={action.isOpen}
      title={`Download the audit pack for FY ${action.payload?.label ?? ""}`}
      variant="default"
    />
  );
}
