import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@pi-dash/design-system/components/ui/dialog";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { mutators } from "@pi-dash/zero/mutators";
import type { Vendor } from "@pi-dash/zero/schema";
import { useZero } from "@rocicorp/zero/react";
import { type FormEvent, useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import { handleMutationResult } from "@/lib/mutation-result";

function submitButtonLabel(submitting: boolean, isEdit: boolean): string {
  if (submitting) {
    return isEdit ? "Saving..." : "Creating...";
  }
  return isEdit ? "Save" : "Create";
}

interface VendorFormFields {
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

function buildVendorPayload(fields: VendorFormFields, existingId?: string) {
  return {
    id: existingId ?? uuidv7(),
    name: fields.name.trim(),
    contactPhone: fields.contactPhone.trim(),
    contactEmail: fields.contactEmail.trim() || undefined,
    bankAccountName: fields.bankAccountName.trim(),
    bankAccountNumber: fields.bankAccountNumber.trim(),
    bankAccountIfscCode: fields.bankAccountIfscCode.trim(),
    address: fields.address.trim() || undefined,
    gstNumber: fields.gstNumber.trim() || undefined,
    panNumber: fields.panNumber.trim() || undefined,
  };
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
  const zero = useZero();
  const isEdit = !!vendor;

  const [name, setName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankAccountIfscCode, setBankAccountIfscCode] = useState("");
  const [address, setAddress] = useState("");
  const [gstNumber, setGstNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(vendor?.name ?? "");
      setContactPhone(vendor?.contactPhone ?? "");
      setContactEmail(vendor?.contactEmail ?? "");
      setBankAccountName(vendor?.bankAccountName ?? "");
      setBankAccountNumber(vendor?.bankAccountNumber ?? "");
      setBankAccountIfscCode(vendor?.bankAccountIfscCode ?? "");
      setAddress(vendor?.address ?? "");
      setGstNumber(vendor?.gstNumber ?? "");
      setPanNumber(vendor?.panNumber ?? "");
    }
  }, [open, vendor]);

  const isValid =
    !!name.trim() &&
    !!contactPhone.trim() &&
    !!bankAccountName.trim() &&
    !!bankAccountNumber.trim() &&
    !!bankAccountIfscCode.trim();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValid) {
      return;
    }

    setSubmitting(true);
    try {
      const payload = buildVendorPayload(
        {
          name,
          contactPhone,
          contactEmail,
          bankAccountName,
          bankAccountNumber,
          bankAccountIfscCode,
          address,
          gstNumber,
          panNumber,
        },
        vendor?.id
      );

      const createPayload =
        mode === "inline"
          ? { ...payload, status: "pending" as const }
          : payload;

      const mutation = isEdit
        ? zero.mutate(mutators.vendor.update(payload))
        : zero.mutate(mutators.vendor.create(createPayload));

      const res = await mutation.server;
      handleMutationResult(res, {
        mutation: `vendor.${isEdit ? "update" : "create"}`,
        entityId: payload.id,
        successMsg: isEdit ? "Vendor updated" : "Vendor created",
        errorMsg: isEdit
          ? "Failed to update vendor"
          : "Failed to create vendor",
      });
      if (res.type !== "error") {
        if (!isEdit) {
          onCreated?.(payload.id);
        }
        onOpenChange(false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Vendor" : "Add New Vendor"}</DialogTitle>
        </DialogHeader>
        {mode === "inline" && (
          <p className="text-muted-foreground text-sm">
            This vendor will be created with pending status and approved when
            your payment request is approved.
          </p>
        )}
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vendor-name">
                Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="vendor-name"
                onChange={(e) => setName(e.target.value)}
                required
                value={name}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vendor-phone">
                Phone <span className="text-destructive">*</span>
              </Label>
              <Input
                id="vendor-phone"
                onChange={(e) => setContactPhone(e.target.value)}
                required
                value={contactPhone}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vendor-email">Email</Label>
              <Input
                id="vendor-email"
                onChange={(e) => setContactEmail(e.target.value)}
                type="email"
                value={contactEmail}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vendor-address">Address</Label>
              <Input
                id="vendor-address"
                onChange={(e) => setAddress(e.target.value)}
                value={address}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vendor-bank-name">
                Bank Account Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="vendor-bank-name"
                onChange={(e) => setBankAccountName(e.target.value)}
                required
                value={bankAccountName}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vendor-bank-number">
                Account Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="vendor-bank-number"
                onChange={(e) => setBankAccountNumber(e.target.value)}
                required
                value={bankAccountNumber}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vendor-ifsc">
                IFSC Code <span className="text-destructive">*</span>
              </Label>
              <Input
                id="vendor-ifsc"
                onChange={(e) => setBankAccountIfscCode(e.target.value)}
                required
                value={bankAccountIfscCode}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vendor-gst">GST Number</Label>
              <Input
                id="vendor-gst"
                onChange={(e) => setGstNumber(e.target.value)}
                value={gstNumber}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vendor-pan">PAN Number</Label>
              <Input
                id="vendor-pan"
                onChange={(e) => setPanNumber(e.target.value)}
                value={panNumber}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={!isValid || submitting} type="submit">
              {submitButtonLabel(submitting, isEdit)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
