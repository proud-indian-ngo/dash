import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from "@pi-dash/design-system/components/ui/tabs";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { log } from "evlog";
import { parseAsString, useQueryState } from "nuqs";
import { useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

import { InventoryItemDialog } from "@/components/kalakriti/inventory-item-dialog";
import { InventoryItemsTable } from "@/components/kalakriti/inventory-items-table";
import {
  InventoryMovementDialog,
  type MovementAction,
} from "@/components/kalakriti/inventory-movement-dialog";
import { InventoryStats } from "@/components/kalakriti/inventory-stats";
import { InventoryTransactionsTable } from "@/components/kalakriti/inventory-transactions-table";
import type { InventoryItem } from "@/components/kalakriti/inventory-types";
import { KalakritiPageHeader } from "@/components/kalakriti/kalakriti-page-header";
import { ScanDialog } from "@/components/kalakriti/scan-dialog";
import { Loader } from "@/components/loader";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { useDashboardDestinationFilter } from "@/lib/kalakriti-dashboard-filter";
import {
  canManageKalakritiInventory,
  canViewKalakritiInventory,
} from "@/lib/kalakriti-inventory-policy";
import { handleMutationResult } from "@/lib/mutation-result";

export const Route = createFileRoute("/_app/kalakriti/$year/inventory")({
  validateSearch: z
    .object({ dashboardFilter: z.string().optional() })
    .passthrough(),
  beforeLoad: ({ context }) => {
    if (!canViewKalakritiInventory(context.kalakritiEditionAccess))
      throw notFound();
  },
  component: KalakritiInventoryPage,
});

function EditionTransactions({ editionId }: { editionId: string }) {
  const [transactions, result] = useQuery(
    queries.kalakritiInventory.transactions({ editionId })
  );
  return (
    <InventoryTransactionsTable
      transactions={transactions}
      complete={result.type === "complete"}
    />
  );
}

function ItemHistory({
  editionId,
  item,
  onOpenChange,
}: {
  editionId: string;
  item: InventoryItem;
  onOpenChange: (open: boolean) => void;
}) {
  const [transactions, result] = useQuery(
    queries.kalakritiInventory.byItem({ editionId, itemId: item.id })
  );
  return (
    <Dialog onOpenChange={onOpenChange} open={true}>
      <DialogContent className="max-h-[90dvh] max-w-[95vw] overflow-auto sm:max-w-[95vw]">
        <DialogHeader>
          <DialogTitle>{item.name} history</DialogTitle>
          <DialogDescription>
            Every stock change is kept as a transaction.
          </DialogDescription>
        </DialogHeader>
        <InventoryTransactionsTable
          transactions={transactions}
          complete={result.type === "complete"}
          storageKey="kalakriti_inventory_item_history_table_state_v1"
        />
      </DialogContent>
    </Dialog>
  );
}

function KalakritiInventoryPage() {
  const dashboardFilterPending = useDashboardDestinationFilter("inventory");
  const { kalakritiEditionAccess: access } = Route.useRouteContext();
  const { edition } = access;
  const [, setFilter] = useQueryState("dashboardFilter", parseAsString);
  const zero = useZero();
  const [items, itemsResult] = useQuery(
    queries.kalakritiInventory.items({ editionId: edition.id })
  );
  const [scanAction, setScanAction] = useState<"dispatch" | "return" | null>(
    null
  );
  const [tab, setTab] = useState("items");
  const [editing, setEditing] = useState<InventoryItem | null | undefined>(
    undefined
  );
  const [movement, setMovement] = useState<{
    item: InventoryItem;
    action: MovementAction;
  } | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const canManage = canManageKalakritiInventory(access);
  const archiveAction = useConfirmAction<InventoryItem>({
    mutationMeta: {
      entityId: (item) => item.id,
      mutation: "kalakritiInventory.archive",
      successMsg: "Item archived",
      errorMsg: "Failed to archive item",
    },
    onConfirm: (item) =>
      zero.mutate(
        mutators.kalakritiInventory.archive({
          editionId: edition.id,
          itemId: item.id,
          auditEntryId: uuidv7(),
          now: Date.now(),
        })
      ).server,
  });

  async function restore(item: InventoryItem) {
    try {
      const result = await zero.mutate(
        mutators.kalakritiInventory.restore({
          editionId: edition.id,
          itemId: item.id,
          auditEntryId: uuidv7(),
          now: Date.now(),
        })
      ).server;
      handleMutationResult(result, {
        mutation: "kalakritiInventory.restore",
        entityId: item.id,
        successMsg: "Item restored",
        errorMsg: "Failed to restore item",
      });
    } catch (error) {
      log.error({
        component: "KalakritiInventoryPage",
        action: "restoreItem",
        editionId: edition.id,
        itemId: item.id,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to restore item");
    }
  }

  return (
    <div className="space-y-4">
      <KalakritiPageHeader
        kicker={`Kalakriti · ${edition.year}`}
        title="Inventory"
      />
      <p className="text-muted-foreground text-sm">
        Track stock for this edition. Each purchase, dispatch, return, and
        correction is recorded in history.
      </p>
      <InventoryStats
        items={items}
        complete={itemsResult.type === "complete"}
        scopeKey={JSON.stringify([
          edition.id,
          access.isGlobalAdmin,
          access.membership?.id,
        ])}
        onReviewOutOfStock={() => {
          setTab("items");
          void setFilter("out_of_stock");
        }}
      />
      {canManage ? (
        <div className="flex gap-2">
          <Button onClick={() => setScanAction("dispatch")}>Dispatch</Button>
          <Button onClick={() => setScanAction("return")}>Return</Button>
        </div>
      ) : null}
      {canManage && scanAction ? (
        <ScanDialog
          editionId={edition.id}
          year={edition.year}
          activities={["dispatch", "return"]}
          initialActivity={scanAction}
          onOpenChange={(open) => {
            if (!open) setScanAction(null);
          }}
        />
      ) : null}
      <Tabs onValueChange={setTab} value={tab}>
        <TabsList>
          <TabsTrigger value="items">Items</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
        </TabsList>
      </Tabs>
      {tab === "items" ? (
        dashboardFilterPending ? (
          <Loader />
        ) : (
          <InventoryItemsTable
            items={items}
            complete={itemsResult.type === "complete"}
            canManage={canManage}
            onAdd={() => setEditing(null)}
            onEdit={setEditing}
            onMovement={(item, action) => setMovement({ item, action })}
            onHistory={setHistoryItem}
            onArchive={archiveAction.trigger}
            onRestore={(item) => {
              void restore(item);
            }}
          />
        )
      ) : (
        <EditionTransactions editionId={edition.id} />
      )}
      {canManage && editing !== undefined ? (
        <InventoryItemDialog
          editionId={edition.id}
          item={editing}
          onOpenChange={(open) => {
            if (!open) setEditing(undefined);
          }}
          open={true}
        />
      ) : null}
      {canManage && movement ? (
        <InventoryMovementDialog
          action={movement.action}
          editionId={edition.id}
          item={movement.item}
          onOpenChange={(open) => {
            if (!open) setMovement(null);
          }}
          open={true}
        />
      ) : null}
      {historyItem ? (
        <ItemHistory
          editionId={edition.id}
          item={historyItem}
          onOpenChange={(open) => {
            if (!open) setHistoryItem(null);
          }}
        />
      ) : null}
      {canManage ? (
        <ConfirmDialog
          title="Archive item?"
          description={`Archive ${archiveAction.payload?.name ?? "this item"}? Stock must be zero. History remains available.`}
          confirmLabel="Archive item"
          loadingLabel="Archiving..."
          loading={archiveAction.isLoading}
          open={archiveAction.isOpen}
          onConfirm={archiveAction.confirm}
          onOpenChange={(open) => {
            if (!open) archiveAction.cancel();
          }}
        />
      ) : null}
    </div>
  );
}
