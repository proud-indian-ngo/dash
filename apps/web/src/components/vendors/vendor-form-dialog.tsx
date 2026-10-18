import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { Vendor } from "@pi-dash/zero/schema";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import {
  getVendorDetails,
  saveVendor,
  type VendorDetailsResponse,
} from "@/functions/vendors";
import { isSaveConflict } from "@/lib/save-conflict";
import {
  type SaveVendorInput,
  saveVendorSchema,
  vendorFieldsSchema,
} from "@/lib/vendor-schema";

type VendorFormValues = Omit<
  SaveVendorInput,
  "expectedPartyUpdatedAt" | "expectedUpdatedAt" | "id" | "mode"
>;

const formSchema = vendorFieldsSchema.omit({
  expectedPartyUpdatedAt: true,
  expectedUpdatedAt: true,
  id: true,
  mode: true,
});

const KEY_MISSING_HINT =
  "Cannot be stored until the encryption key is configured";

function valuesFor(
  vendor: Vendor | null,
  details: VendorDetailsResponse["details"]
): VendorFormValues {
  return {
    address: details?.address ?? "",
    bankAccountIfscCode: details?.bank?.ifscCode ?? "",
    bankAccountName: details?.bank?.accountName ?? "",
    // Stored secrets never come back to the browser; blank keeps them.
    bankAccountNumber: "",
    contactEmail: details?.email ?? "",
    contactPhone: details?.phone ?? "",
    gstNumber: vendor?.gstNumber ?? "",
    name: vendor?.name ?? "",
    panNumber: "",
  };
}

function storedHint(last4: string | null, noun: string): string {
  return `Stored${last4 ? `, ending ${last4}` : ""}. Leave blank to keep it, or enter a new ${noun} to replace it.`;
}

function VendorForm({
  context,
  mode,
  onConflict,
  onCreated,
  onOpenChange,
  onSaved,
  vendor,
}: {
  context: VendorDetailsResponse;
  mode: "admin" | "inline";
  /** Reloads the details after someone else saved the vendor first. */
  onConflict: () => void;
  onCreated?: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  onSaved?: (id: string) => void;
  vendor: Vendor | null;
}) {
  const save = useServerFn(saveVendor);
  const isEdit = vendor !== null;
  const { details, identifiersAvailable } = context;
  // Fixed for the life of the form so a retried create cannot duplicate.
  const [vendorId] = useState(() => vendor?.id ?? uuidv7());
  // The version this editor started from. Reading the live synced row at
  // submit would let a concurrent edit slip past the version check.
  const [loadedUpdatedAt] = useState(() => vendor?.updatedAt ?? null);
  const storedBank = details?.bank ?? null;

  const form = useForm({
    defaultValues: valuesFor(vendor, details),
    onSubmit: async ({ value }) => {
      if (!(value.bankAccountNumber.trim() || storedBank)) {
        toast.error("Enter the account number");
        return;
      }
      const input: SaveVendorInput = {
        ...value,
        expectedPartyUpdatedAt: loadedUpdatedAt,
        expectedUpdatedAt: details?.updatedAt ?? null,
        id: vendorId,
        mode: isEdit ? "update" : "create",
      };
      const check = saveVendorSchema.safeParse(input);
      if (!check.success) {
        toast.error(check.error.issues[0]?.message ?? "Check the form");
        return;
      }
      await save({ data: check.data })
        .then((result) => {
          toast.success(isEdit ? "Vendor updated" : "Vendor created");
          if (!isEdit) {
            onCreated?.(result.vendorId);
          }
          onSaved?.(result.vendorId);
          onOpenChange(false);
        })
        .catch((error: unknown) => {
          log.error({
            action: isEdit ? "vendor.update" : "vendor.create",
            caughtError: error instanceof Error ? error.message : String(error),
            component: "VendorFormDialog",
            mode,
          });
          if (isSaveConflict(error)) {
            toast.error("Someone else changed this vendor", {
              description:
                "The latest details are loaded and your unsaved changes were discarded. Re-enter them and save again.",
            });
            onConflict();
            return;
          }
          toast.error(
            isEdit ? "Couldn't update vendor" : "Couldn't create vendor",
            {
              description:
                error instanceof Error ? error.message : "Something went wrong",
            }
          );
        });
    },
    validators: { onChange: formSchema, onSubmit: formSchema },
  });
  const cancel = useEventCallback(() => onOpenChange(false));

  let accountHint: string | undefined;
  let panHint: string | undefined;
  if (!identifiersAvailable) {
    accountHint = KEY_MISSING_HINT;
    panHint = KEY_MISSING_HINT;
  } else {
    if (storedBank) {
      accountHint = storedHint(storedBank.accountNumberLast4, "number");
    }
    if (details?.hasPan) {
      panHint = storedHint(details.panLast4, "PAN");
    }
  }

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
          label="Bank account name"
          name="bankAccountName"
        />
        <InputField
          description={accountHint}
          disabled={!identifiersAvailable}
          autoComplete="off"
          inputMode="numeric"
          isRequired={!storedBank}
          label="Account number"
          name="bankAccountNumber"
        />
        <InputField
          autoCapitalize="characters"
          autoComplete="off"
          isRequired
          label="IFSC code"
          name="bankAccountIfscCode"
          placeholder="SBIN0001234"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <InputField
          autoCapitalize="characters"
          autoComplete="off"
          label="GST number"
          name="gstNumber"
          placeholder="22AAAAA0000A1Z5"
        />
        <InputField
          autoCapitalize="characters"
          autoComplete="off"
          description={panHint}
          disabled={!identifiersAvailable}
          label="PAN"
          name="panNumber"
          placeholder="ABCDE1234F"
        />
      </div>

      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel={isEdit ? "Save changes" : "Add vendor"}
        submittingLabel={isEdit ? "Saving..." : "Creating..."}
      />
    </FormLayout>
  );
}

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; context: VendorDetailsResponse };

interface VendorFormDialogProps {
  mode?: "admin" | "inline";
  onCreated?: (id: string) => void;
  onOpenChange: (open: boolean) => void;
  /** Called after any successful save, so open detail views can reload. */
  onSaved?: (id: string) => void;
  open: boolean;
  vendor: Vendor | null;
}

export function VendorFormDialog({
  mode = "admin",
  onCreated,
  onOpenChange,
  onSaved,
  open,
  vendor,
}: VendorFormDialogProps) {
  const isEdit = !!vendor;
  const loadDetails = useServerFn(getVendorDetails);
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  // Bumped on every load so each opening starts a fresh form, with a new ID on create.
  const [formKey, setFormKey] = useState(0);
  const vendorId = vendor?.id ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    // Reset on open, not on close, so the content does not flash to a
    // loading state during the close animation.
    setState({ kind: "loading" });
    setFormKey((k) => k + 1);
    loadDetails({ data: { vendorId } })
      .then((context) => {
        if (!cancelled) {
          setState({ context, kind: "ready" });
        }
      })
      .catch((error: unknown) => {
        log.error({
          action: "vendor.loadDetails",
          caughtError: error instanceof Error ? error.message : String(error),
          component: "VendorFormDialog",
        });
        if (!cancelled) {
          // Never show an empty form for an existing vendor: saving it would
          // wipe the stored details.
          setState({ kind: "error" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, vendorId, attempt, loadDetails]);

  const retry = useEventCallback(() => setAttempt((n) => n + 1));

  let body: React.ReactNode;
  if (state.kind === "ready") {
    body = (
      <VendorForm
        context={state.context}
        key={`${vendorId ?? "new"}-${formKey}`}
        mode={mode}
        onConflict={retry}
        onCreated={onCreated}
        onOpenChange={onOpenChange}
        onSaved={onSaved}
        vendor={vendor}
      />
    );
  } else if (state.kind === "error") {
    body = (
      <div className="flex flex-col items-start gap-3 px-1 py-4">
        <p className="text-destructive text-sm">
          Couldn't load the vendor's details.
        </p>
        <Button onClick={retry} size="sm" type="button" variant="outline">
          Try again
        </Button>
      </div>
    );
  } else {
    body = <p className="text-muted-foreground px-1 py-6 text-sm">Loading…</p>;
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-(--dialog-md)">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit vendor" : "Add vendor"}</DialogTitle>
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
        {open ? body : null}
      </DialogContent>
    </Dialog>
  );
}
