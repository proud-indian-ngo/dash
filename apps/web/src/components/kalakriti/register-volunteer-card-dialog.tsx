import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";

import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { PhoneField } from "@/components/form/phone-field-lazy";
import { SelectField } from "@/components/form/select-field";
import { Loader } from "@/components/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import {
  createUserFormSchema,
  defaultCreateUserFormValues,
} from "@/components/users/user-form";
import { useApp } from "@/context/app-context";
import { validateBlankIdCard } from "@/functions/kalakriti-blank-id-card";
import { createUserAdmin } from "@/functions/user-admin";
import { getErrorMessage } from "@/lib/errors";
import { handleMutationResult } from "@/lib/mutation-result";

const genderOptions = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];

interface RegisterVolunteerCardDialogProps {
  editionId: string;
  onClose: () => void;
  printedCardId: string;
}

export function RegisterVolunteerCardDialog({
  editionId,
  onClose,
  printedCardId,
}: RegisterVolunteerCardDialogProps) {
  const { hasPermission } = useApp();
  const [isPending, setIsPending] = useState(false);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!(open || isPending)) {
          onClose();
        }
      }}
      open
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Register volunteer card</DialogTitle>
          <DialogDescription>
            Create a central volunteer account and add it to this Edition using
            the scanned printed card.
          </DialogDescription>
        </DialogHeader>
        {hasPermission("users.create") ? (
          <RegisterVolunteerCardForm
            editionId={editionId}
            isPending={isPending}
            key={printedCardId}
            onClose={onClose}
            onPendingChange={setIsPending}
            printedCardId={printedCardId}
          />
        ) : (
          <p className="text-destructive text-sm" role="alert">
            You need permission to create central users before you can register
            this volunteer card.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RegisterVolunteerCardForm({
  editionId,
  isPending,
  onClose,
  onPendingChange,
  printedCardId,
}: RegisterVolunteerCardDialogProps & {
  isPending: boolean;
  onPendingChange: (pending: boolean) => void;
}) {
  const zero = useZero();
  const createUser = useServerFn(createUserAdmin);
  const validateCard = useServerFn(validateBlankIdCard);
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const registerCard = useEventCallback(async (userId: string) => {
    const auditEntryId = uuidv7();
    const result = await zero.mutate(
      mutators.kalakritiAssignment.addVolunteers({
        auditEntryId,
        editionId,
        now: Date.now(),
        requirePrintedCardId: true,
        volunteers: [
          {
            membershipId: printedCardId,
            teamEventMemberId: uuidv7(),
            userId,
          },
        ],
      })
    ).server;
    handleMutationResult(result, {
      entityId: printedCardId,
      errorMsg:
        "Volunteer account was created, but the card was not registered",
      mutation: "kalakritiAssignment.addVolunteers",
      successMsg: "Volunteer card registered",
    });
    return result.type !== "error";
  });

  const retryRegistration = useEventCallback(async () => {
    if (!createdUserId) {
      return;
    }
    onPendingChange(true);
    setSubmitError(null);
    try {
      const registered = await registerCard(createdUserId);
      if (registered) {
        onClose();
      }
    } catch (error) {
      log.error({
        action: "retryCardRegistration",
        component: "RegisterVolunteerCardDialog",
        editionId,
        error: error instanceof Error ? error.message : String(error),
        printedCardId,
        userId: createdUserId,
      });
      const message = getErrorMessage(
        error,
        "The volunteer account exists, but the card could not be registered"
      );
      setSubmitError(message);
      toast.error(message);
    } finally {
      onPendingChange(false);
    }
  });

  const form = useForm({
    defaultValues: defaultCreateUserFormValues,
    validators: {
      onChange: createUserFormSchema,
      onSubmit: createUserFormSchema,
    },
    onSubmit: async ({ value }) => {
      onPendingChange(true);
      setSubmitError(null);
      let userId: string;
      try {
        await validateCard({
          data: {
            editionId,
            personQr: JSON.stringify({ id: printedCardId, type: "volunteer" }),
          },
        });
        userId = await createUser({
          data: {
            ...value,
            role: "volunteer",
          },
        });
        setCreatedUserId(userId);
      } catch (error) {
        log.error({
          action: "createVolunteerForPrintedCard",
          component: "RegisterVolunteerCardDialog",
          editionId,
          error: error instanceof Error ? error.message : String(error),
          printedCardId,
        });
        const message = getErrorMessage(
          error,
          "The volunteer account could not be created"
        );
        setSubmitError(message);
        toast.error(message);
        onPendingChange(false);
        return;
      }

      try {
        const registered = await registerCard(userId);
        if (registered) {
          onClose();
        }
      } catch (error) {
        log.error({
          action: "registerPrintedVolunteerCard",
          component: "RegisterVolunteerCardDialog",
          editionId,
          error: error instanceof Error ? error.message : String(error),
          printedCardId,
          userId,
        });
        const message = getErrorMessage(
          error,
          "The volunteer account exists, but the card could not be registered"
        );
        setSubmitError(message);
        toast.error(message);
      } finally {
        onPendingChange(false);
      }
    },
  });

  const handleClose = useEventCallback(() => {
    if (!isPending) {
      onClose();
    }
  });

  if (createdUserId) {
    return (
      <div className="space-y-4">
        <div
          className="border-destructive/40 bg-destructive/10 text-destructive border p-3 text-sm"
          role="alert"
        >
          <p>The central volunteer account was created.</p>
          <p>
            The printed card is not registered yet. Retry to link this card
            without creating another account.
          </p>
          {submitError ? <p className="mt-2">{submitError}</p> : null}
        </div>
        {isPending ? (
          <div aria-label="Registering card" className="min-h-16" role="status">
            <Loader />
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button onClick={retryRegistration}>Retry card registration</Button>
            <Button onClick={handleClose} variant="outline">
              Close
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <FormLayout form={form} submitError={submitError}>
      <div className="grid gap-3 md:grid-cols-2">
        <InputField isRequired label="Name" name="name" />
        <InputField isRequired label="Email" name="email" type="email" />
        <InputField
          isRequired
          label="Password"
          name="password"
          type="password"
        />
        <PhoneField defaultCountry="IN" label="Phone" name="phone" />
        <DateField label="Date of birth" name="dob" />
        <SelectField
          isRequired
          label="Gender"
          name="gender"
          options={genderOptions}
          placeholder="Select gender"
        />
      </div>
      <FormActions
        disabled={isPending}
        onCancel={handleClose}
        submitLabel="Create and register volunteer"
        submittingLabel="Creating volunteer..."
      />
    </FormLayout>
  );
}
