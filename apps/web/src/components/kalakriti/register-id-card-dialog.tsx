import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { parseKalakritiPersonQr } from "@pi-dash/shared/kalakriti-person-qr";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useRef, useState } from "react";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { Loader } from "@/components/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { validateBlankIdCard } from "@/functions/kalakriti-blank-id-card";

import { AttendeeFormDialog } from "./attendee-form-dialog";
import { EventDayQrScanner } from "./event-day-qr-scanner";
import { RegisterVolunteerCardDialog } from "./register-volunteer-card-dialog";

const manualQrSchema = z.object({
  personQr: z.string().trim().min(1, "Paste the QR code value"),
});

type PrintableCardRegistration = ReturnType<typeof parseKalakritiPersonQr> & {
  type: "guest" | "judge" | "volunteer";
};

function ManualQrForm({
  disabled,
  onCancel,
  onScan,
}: {
  disabled: boolean;
  onCancel: () => void;
  onScan: (value: string) => Promise<void>;
}) {
  const form = useForm({
    defaultValues: { personQr: "" },
    onSubmit: async ({ value }) => onScan(value.personQr),
    validators: { onChange: manualQrSchema, onSubmit: manualQrSchema },
  });

  return (
    <FormLayout form={form}>
      <fieldset className="space-y-3" disabled={disabled}>
        <InputField
          autoComplete="off"
          isRequired
          label="QR code value"
          name="personQr"
          placeholder='{"id":"…","type":"guest"}'
        />
        <FormActions
          disabled={disabled}
          onCancel={onCancel}
          submitLabel="Register card"
          submittingLabel="Checking card..."
        />
      </fieldset>
    </FormLayout>
  );
}

export function RegisterIdCardDialog({
  className,
  editionId,
}: {
  className?: string;
  editionId: string;
}) {
  const validateCard = useServerFn(validateBlankIdCard);
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registration, setRegistration] =
    useState<PrintableCardRegistration | null>(null);
  const checkingRef = useRef(false);

  const handleOpenChange = useEventCallback((nextOpen: boolean) => {
    if (checkingRef.current) return;
    if (nextOpen) {
      setError(null);
      setFormKey((key) => key + 1);
    }
    setOpen(nextOpen);
  });
  const handleTrigger = useEventCallback(() => handleOpenChange(true));
  const handleRegistrationClose = useEventCallback(() => setRegistration(null));
  const handleScan = useEventCallback(async (value: string) => {
    if (checkingRef.current) return;

    let person: ReturnType<typeof parseKalakritiPersonQr>;
    try {
      person = parseKalakritiPersonQr(value.trim());
    } catch (scanError) {
      log.error({
        action: "parseBlankIdCardQr",
        component: "RegisterIdCardDialog",
        editionId,
        error:
          scanError instanceof Error ? scanError.message : String(scanError),
      });
      setError("Scan or paste a valid blank ID card QR code.");
      return;
    }

    if (
      person.type !== "volunteer" &&
      person.type !== "guest" &&
      person.type !== "judge"
    ) {
      setError(
        "Only blank Volunteer, Guest, and Judge cards can be registered."
      );
      return;
    }
    const printablePerson: PrintableCardRegistration = {
      id: person.id,
      type: person.type,
    };

    checkingRef.current = true;
    setChecking(true);
    setError(null);
    try {
      await validateCard({
        data: { editionId, personQr: JSON.stringify(printablePerson) },
      });
      setOpen(false);
      setRegistration(printablePerson);
    } catch (validationError) {
      log.error({
        action: "validateBlankIdCard",
        component: "RegisterIdCardDialog",
        editionId,
        error:
          validationError instanceof Error
            ? validationError.message
            : String(validationError),
        printedCardId: printablePerson.id,
        type: printablePerson.type,
      });
      setError(
        validationError instanceof Error
          ? validationError.message
          : "This ID card could not be registered."
      );
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  });

  return (
    <>
      <Button
        className={className}
        onClick={handleTrigger}
        type="button"
        variant="outline"
      >
        Register ID card
      </Button>
      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogContent aria-label="Register ID card" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Register ID card</DialogTitle>
            <DialogDescription>
              Scan a blank Volunteer, Guest, or Judge card, then enter the
              person's details to link them to the printed card.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Scan card QR</h3>
            <EventDayQrScanner onScan={handleScan} />
          </div>
          {checking ? (
            <div aria-label="Checking card" role="status">
              <Loader />
            </div>
          ) : null}
          {error ? (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">
              Can't scan? Paste the QR code value
            </h3>
            <ManualQrForm
              disabled={checking}
              key={formKey}
              onCancel={() => handleOpenChange(false)}
              onScan={handleScan}
            />
          </div>
        </DialogContent>
      </Dialog>
      {registration?.type === "guest" || registration?.type === "judge" ? (
        <AttendeeFormDialog
          editionId={editionId}
          kind={registration.type}
          onClose={handleRegistrationClose}
          printedCardId={registration.id}
        />
      ) : null}
      {registration?.type === "volunteer" ? (
        <RegisterVolunteerCardDialog
          editionId={editionId}
          onClose={handleRegistrationClose}
          printedCardId={registration.id}
        />
      ) : null}
    </>
  );
}
