import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { KALAKRITI_INVENTORY_LABELS } from "@pi-dash/shared/kalakriti-inventory";
import { inventoryMovementFieldsSchema } from "@pi-dash/zero/kalakriti-inventory-schema";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { TextareaField } from "@/components/form/textarea-field";
import { handleMutationResult } from "@/lib/mutation-result";

import type { InventoryItem } from "./inventory-types";

export type MovementAction = "purchase" | "adjustment";

const movementFieldsSchema = z.object({
  quantity: z.number().int().min(0),
  notes: z.string().trim().max(500),
});

function validationSchema(action: MovementAction, expectedQuantity: number) {
  return movementFieldsSchema.superRefine((value, ctx) => {
    const result = inventoryMovementFieldsSchema.safeParse({
      type: action,
      quantity: value.quantity,
      expectedQuantity: action === "adjustment" ? expectedQuantity : undefined,
      volunteerMembershipId: null,
      competitionId: null,
      notes: value.notes.trim() || null,
    });
    if (!result.success)
      for (const issue of result.error.issues)
        ctx.addIssue({
          code: "custom",
          message: issue.message,
          path: issue.path,
        });
  });
}

interface Props {
  action: MovementAction;
  editionId: string;
  item: InventoryItem;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function MovementForm({
  action,
  editionId,
  item,
  onOpenChange,
}: Omit<Props, "open">) {
  const zero = useZero();
  const [command] = useState(() => ({
    transactionId: uuidv7(),
    auditEntryId: uuidv7(),
    now: Date.now(),
  }));
  const schema = validationSchema(action, item.quantity);
  const form = useForm({
    defaultValues: {
      quantity: action === "adjustment" ? item.quantity : 1,
      notes: "",
    },
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: async ({ value }) => {
      const { transactionId, auditEntryId, now } = command;
      try {
        const result = await zero.mutate(
          mutators.kalakritiInventory.record({
            editionId,
            itemId: item.id,
            transactionId,
            auditEntryId,
            now,
            type: action,
            quantity: value.quantity,
            expectedQuantity:
              action === "adjustment" ? item.quantity : undefined,
            volunteerMembershipId: null,
            competitionId: null,
            notes: value.notes.trim() || null,
          })
        ).server;
        handleMutationResult(result, {
          mutation: "kalakritiInventory.record",
          entityId: item.id,
          successMsg: `${KALAKRITI_INVENTORY_LABELS[action]} recorded`,
          errorMsg: `Failed to record ${KALAKRITI_INVENTORY_LABELS[action].toLowerCase()}`,
        });
        if (result.type !== "error") onOpenChange(false);
      } catch (error) {
        log.error({
          component: "InventoryMovementDialog",
          action: "recordMovement",
          editionId,
          itemId: item.id,
          transactionId,
          movementType: action,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error("Failed to record stock movement");
      }
    },
  });

  return (
    <FormLayout form={form}>
      <p className="text-muted-foreground text-sm">
        Current stock: {item.quantity}
      </p>
      <InputField
        isRequired
        label={action === "adjustment" ? "Counted stock" : "Quantity"}
        min={action === "adjustment" ? 0 : 1}
        name="quantity"
        step={1}
        type="number"
      />
      {action === "adjustment" ? (
        <form.Subscribe selector={(state) => state.values.quantity}>
          {(counted) => (
            <p aria-live="polite" className="text-sm">
              Change: {counted - item.quantity > 0 ? "+" : ""}
              {counted - item.quantity}
            </p>
          )}
        </form.Subscribe>
      ) : null}
      <TextareaField
        isRequired={action === "adjustment"}
        label={action === "adjustment" ? "Reason" : "Purpose / notes"}
        name="notes"
        placeholder={
          action === "adjustment"
            ? "Why does the counted stock differ?"
            : "Optional"
        }
      />
      <FormActions
        onCancel={() => onOpenChange(false)}
        submitLabel={`Record ${KALAKRITI_INVENTORY_LABELS[action].toLowerCase()}`}
        submittingLabel="Recording..."
      />
    </FormLayout>
  );
}

export function InventoryMovementDialog({
  action,
  editionId,
  item,
  onOpenChange,
  open,
}: Props) {
  const [formKey, setFormKey] = useState(0);
  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (nextOpen) setFormKey((key) => key + 1);
        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {KALAKRITI_INVENTORY_LABELS[action]} · {item.name}
          </DialogTitle>
          <DialogDescription>
            {action === "adjustment"
              ? "Set the counted quantity. The change and reason remain in history."
              : "The stock movement will be kept in the transaction history."}
          </DialogDescription>
        </DialogHeader>
        <MovementForm
          action={action}
          editionId={editionId}
          item={item}
          key={formKey}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}
