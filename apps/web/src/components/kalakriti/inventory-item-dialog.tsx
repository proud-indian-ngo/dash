import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { ALLOWED_IMAGE_TYPES } from "@pi-dash/shared/constants";
import { inventoryItemFieldsSchema } from "@pi-dash/zero/kalakriti-inventory-schema";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { log } from "evlog";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { CheckboxField } from "@/components/form/checkbox-field";
import { CustomField } from "@/components/form/custom-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import {
  discardTemporaryInventoryPhoto,
  getKalakritiInventoryPhotoUrl,
  uploadKalakritiInventoryPhoto,
} from "@/lib/kalakriti-inventory-upload";
import { handleMutationResult } from "@/lib/mutation-result";

import type { InventoryItem } from "./inventory-types";

const itemSchema = z
  .object({
    name: z.string().trim(),
    openingQuantity: z.number(),
    unitPriceRupees: z
      .number()
      .min(0)
      .refine(
        (value) => Number.isSafeInteger(Math.round(value * 100)),
        "Enter a valid price"
      )
      .refine(
        (value) => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001,
        "Use at most two decimal places"
      ),
    photo: z.instanceof(File).nullable(),
    removePhoto: z.boolean(),
  })
  .superRefine((value, ctx) => {
    const result = inventoryItemFieldsSchema.safeParse({
      name: value.name,
      openingQuantity: value.openingQuantity,
      unitPricePaise: Math.round(value.unitPriceRupees * 100),
    });
    if (!result.success)
      for (const issue of result.error.issues)
        ctx.addIssue({
          code: "custom",
          message: issue.message,
          path:
            issue.path[0] === "unitPricePaise"
              ? ["unitPriceRupees"]
              : issue.path,
        });
  });

interface Props {
  editionId: string;
  item: InventoryItem | null;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

function ItemForm({ editionId, item, onOpenChange }: Omit<Props, "open">) {
  const zero = useZero();
  const [command] = useState(() => ({
    itemId: item?.id ?? uuidv7(),
    transactionId: uuidv7(),
    auditEntryId: uuidv7(),
    now: Date.now(),
  }));
  const pendingUploadKey = useRef<string | null>(null);
  const unmounted = useRef(false);
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      if (pendingUploadKey.current)
        void discardTemporaryInventoryPhoto(pendingUploadKey.current);
    };
  }, []);
  const form = useForm({
    defaultValues: {
      name: item?.name ?? "",
      openingQuantity: 0,
      unitPriceRupees: (item?.unitPricePaise ?? 0) / 100,
      photo: null as File | null,
      removePhoto: false,
    },
    validators: { onChange: itemSchema, onSubmit: itemSchema },
    onSubmit: async ({ value }) => {
      const { itemId, transactionId, auditEntryId, now } = command;
      try {
        const photo = value.photo
          ? await uploadKalakritiInventoryPhoto(value.photo, editionId)
          : value.removePhoto
            ? null
            : undefined;
        if (photo?.objectKey) {
          pendingUploadKey.current = photo.objectKey;
          if (unmounted.current) {
            await discardTemporaryInventoryPhoto(photo.objectKey);
            pendingUploadKey.current = null;
            return;
          }
        }
        const shared = {
          editionId,
          itemId,
          auditEntryId,
          now,
          name: value.name.trim(),
          unitPricePaise: Math.round(value.unitPriceRupees * 100),
        };
        const result = item
          ? await zero.mutate(
              mutators.kalakritiInventory.update({ ...shared, photo })
            ).server
          : await zero.mutate(
              mutators.kalakritiInventory.create({
                ...shared,
                openingQuantity: value.openingQuantity,
                transactionId,
                photo: photo ?? null,
              })
            ).server;
        handleMutationResult(result, {
          mutation: item
            ? "kalakritiInventory.update"
            : "kalakritiInventory.create",
          entityId: itemId,
          successMsg: item ? "Item updated" : "Item created",
          errorMsg: item ? "Failed to update item" : "Failed to create item",
        });
        if (result.type !== "error") {
          pendingUploadKey.current = null;
          onOpenChange(false);
        } else if (pendingUploadKey.current) {
          await discardTemporaryInventoryPhoto(pendingUploadKey.current);
          pendingUploadKey.current = null;
        }
      } catch (error) {
        if (pendingUploadKey.current) {
          await discardTemporaryInventoryPhoto(pendingUploadKey.current);
          pendingUploadKey.current = null;
        }
        log.error({
          component: "InventoryItemDialog",
          action: item ? "updateItem" : "createItem",
          editionId,
          itemId,
          error: error instanceof Error ? error.message : String(error),
        });
        toast.error("Failed to save item");
      }
    },
  });

  return (
    <FormLayout form={form}>
      <InputField autoFocus isRequired label="Item name" name="name" />
      {item ? null : (
        <InputField
          isRequired
          label="Opening quantity"
          min={0}
          name="openingQuantity"
          step={1}
          type="number"
        />
      )}
      <InputField
        isRequired
        label="Unit price (₹)"
        min={0}
        name="unitPriceRupees"
        step="0.01"
        type="number"
      />
      <CustomField<File | null> label="Photo" name="photo">
        {(field) => (
          <Input
            accept={ALLOWED_IMAGE_TYPES.join(",")}
            id="photo"
            onChange={(event) =>
              field.handleChange(event.target.files?.[0] ?? null)
            }
            type="file"
          />
        )}
      </CustomField>
      {item?.photoKey ? (
        <div className="space-y-2">
          <img
            alt={item.photoName ?? `${item.name} photo`}
            className="size-24 rounded object-cover"
            src={getKalakritiInventoryPhotoUrl(item.id)}
          />
          <CheckboxField label="Remove current photo" name="removePhoto" />
        </div>
      ) : null}
      <FormActions
        onCancel={() => onOpenChange(false)}
        submitLabel={item ? "Save changes" : "Create item"}
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

export function InventoryItemDialog({
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
          <DialogTitle>{item ? "Edit item" : "Add inventory item"}</DialogTitle>
          <DialogDescription>
            {item
              ? "Update the catalog details. Stock changes are recorded separately."
              : "Opening stock is recorded in the transaction history."}
          </DialogDescription>
        </DialogHeader>
        <ItemForm
          editionId={editionId}
          item={item}
          key={formKey}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}
