import { mutators } from "@pi-dash/zero/mutators";
import type { Vendor } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { PhoneField } from "@/components/form/phone-field-lazy";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { handleMutationResult } from "@/lib/mutation-result";
import { vendorFormSchema } from "@/lib/validators";

interface VendorFormValues {
  address: string;
  bankAccountIfscCode: string;
  bankAccountName: string;
  bankAccountNumber: string;
  contactEmail: string;
  contactPhone: string;
  gstNumber: string;
  name: string;
  panNumber: string;
}

function getDefaultValues(vendor: Vendor | null): VendorFormValues {
  return {
    address: vendor?.address ?? "",
    bankAccountIfscCode: vendor?.bankAccountIfscCode ?? "",
    bankAccountName: vendor?.bankAccountName ?? "",
    bankAccountNumber: vendor?.bankAccountNumber ?? "",
    contactEmail: vendor?.contactEmail ?? "",
    contactPhone: vendor?.contactPhone ?? "",
    gstNumber: vendor?.gstNumber ?? "",
    name: vendor?.name ?? "",
    panNumber: vendor?.panNumber ?? "",
  };
}

function buildVendorPayload(fields: VendorFormValues, existingId?: string) {
  return {
    address: fields.address.trim() || undefined,
    bankAccountIfscCode: fields.bankAccountIfscCode.trim().toUpperCase(),
    bankAccountName: fields.bankAccountName.trim(),
    bankAccountNumber: fields.bankAccountNumber.trim(),
    contactEmail: fields.contactEmail.trim() || undefined,
    contactPhone: fields.contactPhone.trim(),
    gstNumber: fields.gstNumber.trim().toUpperCase() || undefined,
    id: existingId ?? uuidv7(),
    name: fields.name.trim(),
    panNumber: fields.panNumber.trim().toUpperCase() || undefined,
  };
}

function VendorFormContent({
  isEdit,
  mode,
  onCreated,
  onOpenChange,
  vendor,
}: {
  isEdit: boolean;
  mode: "admin" | "inline";
  onCreated?: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  vendor: Vendor | null;
}) {
  const zero = useZero();

  const form = useForm({
    defaultValues: getDefaultValues(vendor),
    onSubmit: async ({ value }) => {
      const payload = buildVendorPayload(value, vendor?.id);

      const createPayload =
        mode === "inline"
          ? { ...payload, status: "pending" as const }
          : payload;

      const mutation = isEdit
        ? zero.mutate(mutators.vendor.update(payload))
        : zero.mutate(mutators.vendor.create(createPayload));

      const res = await mutation.server;
      handleMutationResult(res, {
        entityId: payload.id,
        errorMsg: isEdit ? "Couldn't update vendor" : "Couldn't create vendor",
        mutation: `vendor.${isEdit ? "update" : "create"}`,
        successMsg: isEdit ? "Vendor updated" : "Vendor created",
      });
      if (res.type !== "error") {
        if (!isEdit) {
          onCreated?.(payload.id);
        }
        onOpenChange(false);
      }
    },
    validators: {
      onChange: vendorFormSchema,
      onSubmit: vendorFormSchema,
    },
  });
  const stableOnCancel0 = () => onOpenChange(false);

  return (
    <FormLayout form={form}>
      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          isRequired
          label="Name"
          name="name"
          placeholder="Vendor name"
        />
        <PhoneField
          defaultCountry="IN"
          isRequired
          label="Phone"
          name="contactPhone"
        />
        <InputField
          label="Email"
          name="contactEmail"
          placeholder="vendor@example.com"
          type="email"
        />
        <InputField label="Address" name="address" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <InputField
          isRequired
          label="Bank Account Name"
          name="bankAccountName"
        />
        <InputField
          isRequired
          label="Account Number"
          name="bankAccountNumber"
        />
        <InputField
          isRequired
          label="IFSC Code"
          name="bankAccountIfscCode"
          placeholder="SBIN0001234"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          label="GST Number"
          name="gstNumber"
          placeholder="22AAAAA0000A1Z5"
        />
        <InputField
          label="PAN Number"
          name="panNumber"
          placeholder="ABCDE1234F"
        />
      </div>

      <FormActions
        disableWhenInvalid={false}
        onCancel={stableOnCancel0}
        submitLabel={isEdit ? "Save" : "Create"}
        submittingLabel={isEdit ? "Saving..." : "Creating..."}
      />
    </FormLayout>
  );
}

interface VendorFormDialogProps {
  mode?: "admin" | "inline";
  onCreated?: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  vendor: Vendor | null;
}

export function VendorFormDialog({
  mode = "admin",
  onCreated,
  onOpenChange,
  open,
  vendor,
}: VendorFormDialogProps) {
  const isEdit = !!vendor;
  const [formKey, setFormKey] = useState(0);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setFormKey((k: any) => k + 1);
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Vendor" : "Add New Vendor"}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? "Edit vendor details" : "Create a new vendor"}
          </DialogDescription>
        </DialogHeader>
        {mode === "inline" && (
          <p className="text-muted-foreground text-sm">
            This vendor will be created with pending status and approved when
            your payment request is approved.
          </p>
        )}
        <VendorFormContent
          isEdit={isEdit}
          key={formKey}
          mode={mode}
          onCreated={onCreated}
          onOpenChange={onOpenChange}
          vendor={vendor}
        />
      </DialogContent>
    </Dialog>
  );
}
