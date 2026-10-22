import { Invoice03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { RECEIPTING_START_LABEL } from "@pi-dash/shared/receipts";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { useState } from "react";

import { NotFoundState } from "@/components/shared/not-found-state";
import { isAwaitingResult } from "@/lib/zero-result";

import { ReceiptDetailSheet } from "./receipt-detail-sheet";
import type { ReceiptRow } from "./receipt-types";
import { ReceiptsTable } from "./receipts-table";
import { useReceiptContacts } from "./use-receipt-contacts";
import { type ReceiptSend, useSendReceipt } from "./use-send-receipt";
import { VoidReceiptDialog } from "./void-receipt-dialog";

/**
 * Income → Receipts: every receipt pi-dash issued, voided ones included.
 * Readers see the list and delivery; issuers (donors.receipt) download,
 * send and void.
 */
export function ReceiptsTab({
  canIssue,
  onIssue,
}: {
  canIssue: boolean;
  onIssue: () => void;
}) {
  const [receipts, result] = useQuery(queries.contributionReceipt.list());
  const rows = receipts as ReceiptRow[];
  const isLoading = rows.length === 0 && isAwaitingResult(result);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<ReceiptRow | null>(null);
  const { send, sendingId } = useSendReceipt();
  // Live receipts only; voiding or issuing changes the set.
  const contacts = useReceiptContacts(
    canIssue,
    rows
      .filter((row) => !row.voidedAt)
      .map((row) => row.id)
      .join(",")
  );
  const viewing = viewingId
    ? (rows.find((row) => row.id === viewingId) ?? null)
    : null;
  const handleView = useEventCallback((row: ReceiptRow) =>
    setViewingId(row.id)
  );
  const handleSend = useEventCallback((how: ReceiptSend, row: ReceiptRow) => {
    send(how, row);
  });
  const handleVoid = useEventCallback((row: ReceiptRow) => setVoiding(row));

  if (!isLoading && rows.length === 0) {
    return (
      <NotFoundState
        actions={
          canIssue ? (
            <Button onClick={onIssue} type="button">
              <HugeiconsIcon
                className="size-4"
                icon={Invoice03Icon}
                strokeWidth={2}
              />
              Issue receipts
            </Button>
          ) : null
        }
        description={`Receipts for direct gifts (UPI, NEFT/IMPS, cheque) received from ${RECEIPTING_START_LABEL} appear here. Razorpay and give.do send their own.`}
        icon={Invoice03Icon}
        title="No receipts yet"
      />
    );
  }

  return (
    <>
      <ReceiptsTable
        canIssue={canIssue}
        contacts={contacts}
        data={rows}
        isLoading={isLoading}
        onSend={handleSend}
        onView={handleView}
        onVoid={handleVoid}
        sendingId={sendingId}
      />
      <ReceiptDetailSheet
        canIssue={canIssue}
        contacts={viewing ? contacts?.[viewing.id] : undefined}
        onOpenChange={(open) => {
          if (!open) {
            setViewingId(null);
          }
        }}
        onSend={handleSend}
        onVoid={handleVoid}
        receipt={viewing}
        sending={sendingId !== null}
      />
      <VoidReceiptDialog
        onOpenChange={(open) => {
          if (!open) {
            setVoiding(null);
          }
        }}
        receipt={voiding}
      />
    </>
  );
}
