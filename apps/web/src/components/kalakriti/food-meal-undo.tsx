import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useConnectionState, useQuery, useZero } from "@rocicorp/zero/react";
import { log } from "evlog";
import { useEffect, useRef } from "react";
import { uuidv7 } from "uuidv7";

import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import type { KalakritiEditionAccess } from "@/functions/kalakriti-access";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import { canUndoKalakritiMeal } from "@/lib/kalakriti-food-policy";

import {
  FoodTable,
  type FoodMealUndoTarget,
  type FoodTableRow,
} from "./food-table";

function makeUndoArgs(editionId: string, targetOperationId: string) {
  return {
    editionId,
    targetOperationId,
    id: uuidv7(),
    operationId: uuidv7(),
    auditEntryId: uuidv7(),
    now: Date.now(),
  };
}
interface UndoPayload extends FoodMealUndoTarget {
  args: ReturnType<typeof makeUndoArgs>;
}
export function FoodMealUndo({
  access,
  data,
  complete,
  scopeKey,
}: {
  access: KalakritiEditionAccess;
  data: FoodTableRow[];
  complete: boolean;
  scopeKey: string;
}) {
  const zero = useZero();
  const connection = useConnectionState();
  const [edition, editionResult] = useQuery(
    queries.kalakritiEdition.byYear({ year: access.edition.year })
  );
  const [membership, membershipResult] = useQuery(
    queries.kalakritiAssignment.myAccess({ editionId: access.edition.id }),
    { enabled: !access.isGlobalAdmin }
  );
  const active = useRef(true);
  const pending = useRef(false);
  const attempts = useRef(new Map<string, ReturnType<typeof makeUndoArgs>>());
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const allowed = canUndoKalakritiMeal({
    isGlobalAdmin: access.isGlobalAdmin,
    membership:
      membershipResult.type === "complete" ? (membership ?? null) : null,
    edition: { lifecycle: edition?.lifecycle ?? "" },
  });
  const ready =
    allowed &&
    complete &&
    editionResult.type === "complete" &&
    edition?.id === access.edition.id &&
    connection.name === "connected";
  const targetIsCurrent = (payload: UndoPayload) =>
    data.some((row) =>
      row.operations.some(
        (operation) =>
          operation.id === payload.targetOperationId &&
          (operation.supersededByOperationId === null ||
            operation.supersededByOperationId === payload.args.id)
      )
    );
  const action = useConfirmAction<UndoPayload>({
    mutationMeta: {
      mutation: "kalakritiOperation.undoMeal",
      entityId: (payload) => payload.targetOperationId,
      successMsg: "Meal undone",
      errorMsg: "Meal could not be undone",
    },
    onConfirm: async (payload) => {
      if (
        !active.current ||
        pending.current ||
        !ready ||
        !targetIsCurrent(payload)
      )
        return {
          type: "error",
          error: { message: "Wait for an authoritative live meal record." },
        };
      pending.current = true;
      try {
        return await zero.mutate(
          mutators.kalakritiOperation.undoMeal(payload.args)
        ).server;
      } catch (error) {
        log.error({
          component: "FoodMealUndo",
          action: "undoMeal",
          editionId: access.edition.id,
          targetOperationId: payload.targetOperationId,
          error: "Meal undo request failed",
          errorType: error instanceof Error ? error.name : "unknown",
        });
        return {
          type: "error",
          error: {
            message: "Response uncertain. Retry to confirm the same undo.",
          },
        };
      } finally {
        pending.current = false;
      }
    },
  });
  const requestUndo = useEventCallback((target: FoodMealUndoTarget) => {
    if (!active.current || pending.current || action.isOpen || !ready) return;
    let args = attempts.current.get(target.targetOperationId);
    if (!args) {
      args = makeUndoArgs(access.edition.id, target.targetOperationId);
      attempts.current.set(target.targetOperationId, args);
    }
    const payload = { ...target, args };
    if (targetIsCurrent(payload)) action.trigger(payload);
  });
  const changeOpen = useEventCallback((open: boolean) => {
    if (!open && !pending.current) action.cancel();
  });
  const confirm = useEventCallback(() => {
    if (active.current && !pending.current && ready) action.confirm();
  });
  return (
    <>
      <FoodTable
        data={data}
        isLoading={data.length === 0 && !complete}
        statusSnapshotComplete={complete}
        statusSnapshotKey={scopeKey}
        onUndoMeal={allowed ? requestUndo : undefined}
        undoDisabled={!ready || action.isLoading}
      />
      <ConfirmDialog
        open={action.isOpen}
        onOpenChange={changeOpen}
        onConfirm={confirm}
        title="Undo served meal?"
        description={`Undo ${action.payload?.meal ?? "meal"} for ${action.payload?.personName ?? "this person"}? History is preserved. Start a new Scan session to serve this meal again.`}
        confirmLabel="Undo meal"
        loadingLabel="Undoing..."
        loading={action.isLoading}
        confirmDisabled={
          !ready || !action.payload || !targetIsCurrent(action.payload)
        }
      />
    </>
  );
}
