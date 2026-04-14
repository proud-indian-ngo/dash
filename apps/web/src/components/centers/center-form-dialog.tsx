import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@pi-dash/design-system/components/ui/combobox";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { type FormEvent, useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { handleMutationResult } from "@/lib/mutation-result";

const CITY_OPTIONS = [
  { label: "Bangalore", value: "bangalore" },
  { label: "Mumbai", value: "mumbai" },
];

function submitButtonLabel(submitting: boolean, isEdit: boolean): string {
  if (submitting) {
    return isEdit ? "Saving..." : "Creating...";
  }
  return isEdit ? "Save" : "Create";
}

interface CenterFormDialogProps {
  initialValues?: {
    id: string;
    name: string;
    city: "bangalore" | "mumbai" | null;
    address: string | null;
  };
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function CenterFormDialog({
  initialValues,
  onOpenChange,
  open,
}: CenterFormDialogProps) {
  const zero = useZero();
  const isEdit = !!initialValues;

  const [name, setName] = useState(initialValues?.name ?? "");
  const [city, setCity] = useState<"bangalore" | "mumbai" | "">(
    (initialValues?.city as "bangalore" | "mumbai") ?? ""
  );
  const [address, setAddress] = useState(initialValues?.address ?? "");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? "");
      setCity(initialValues?.city ?? "");
      setAddress(initialValues?.address ?? "");
    }
  }, [open, initialValues]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    setSubmitting(true);
    const mutation = isEdit
      ? zero.mutate(
          mutators.center.update({
            id: initialValues.id,
            name: trimmedName,
            city: (city as "bangalore" | "mumbai") || undefined,
            address: address.trim() || undefined,
            now: Date.now(),
          })
        )
      : zero.mutate(
          mutators.center.create({
            id: uuidv7(),
            name: trimmedName,
            city: (city as "bangalore" | "mumbai") || undefined,
            address: address.trim() || undefined,
            now: Date.now(),
          })
        );
    const res = await mutation.server;
    setSubmitting(false);
    handleMutationResult(res, {
      mutation: isEdit ? "center.update" : "center.create",
      entityId: isEdit ? initialValues.id : "new",
      successMsg: isEdit ? "Center updated" : "Center created",
      errorMsg: isEdit ? "Couldn't update center" : "Couldn't create center",
    });
    if (res.type !== "error") {
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Center" : "Create Center"}</DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? "Edit center details" : "Create a new center"}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="center-name">Name</Label>
            <Input
              id="center-name"
              onChange={(e) => setName(e.target.value)}
              placeholder="Center name"
              required
              value={name}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="center-city">City</Label>
            <Combobox
              items={CITY_OPTIONS.map((opt) => opt.value)}
              itemToStringLabel={(value) =>
                CITY_OPTIONS.find((opt) => opt.value === value)?.label ??
                String(value)
              }
              onValueChange={(value) =>
                setCity((value as "bangalore" | "mumbai") || "")
              }
              value={city}
            >
              <ComboboxInput
                aria-label="City"
                className="w-full"
                id="center-city"
                placeholder="Select a city"
              />
              <ComboboxContent className="w-fit min-w-[var(--anchor-width)] max-w-[min(32rem,var(--available-width))]">
                <ComboboxList>
                  {(itemValue) => (
                    <ComboboxItem key={itemValue} value={itemValue}>
                      {CITY_OPTIONS.find((opt) => opt.value === itemValue)
                        ?.label || itemValue}
                    </ComboboxItem>
                  )}
                </ComboboxList>
                <ComboboxEmpty>No matching cities.</ComboboxEmpty>
              </ComboboxContent>
            </Combobox>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="center-address">Address</Label>
            <Textarea
              id="center-address"
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Optional address"
              rows={3}
              value={address}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={submitting || !name.trim()} type="submit">
              {submitButtonLabel(submitting, isEdit)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
