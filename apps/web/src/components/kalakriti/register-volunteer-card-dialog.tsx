import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { useServerFn } from "@tanstack/react-start";
import { log } from "evlog";
import { isValidPhoneNumber } from "libphonenumber-js";
import { useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { PhoneField } from "@/components/form/phone-field-lazy";
import { Loader } from "@/components/loader";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { useApp } from "@/context/app-context";
import { createUserAdmin } from "@/functions/user-admin";
import { getErrorMessage } from "@/lib/errors";
import { handleMutationResult } from "@/lib/mutation-result";

const registerVolunteerCardSchema = z
  .object({
    email: z
      .string()
      .trim()
      .pipe(z.union([z.literal(""), z.email("Enter a valid email address")])),
    name: z.string().trim().min(1, "Name is required").max(120),
    password: z.string(),
    phone: z.string(),
  })
  .superRefine((value, ctx) => {
    const phone = value.phone.trim();
    if (phone && phone !== "+" && !isValidPhoneNumber(phone)) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid phone number",
        path: ["phone"],
      });
    }
    if (value.email && value.password.length < 8) {
      ctx.addIssue({
        code: "custom",
        message: "Password must be at least 8 characters",
        path: ["password"],
      });
    }
  });

function optionalContact(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "+") {
    return null;
  }
  return trimmed;
}

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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Register volunteer card</DialogTitle>
          <DialogDescription>
            Name is required. Email and phone are optional. Leave both blank to
            add this person without a login. Enter an email to create an account
            they can sign in with.
          </DialogDescription>
        </DialogHeader>
        <RegisterVolunteerCardForm
          editionId={editionId}
          isPending={isPending}
          key={printedCardId}
          onClose={onClose}
          onPendingChange={setIsPending}
          printedCardId={printedCardId}
        />
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
  const { hasPermission } = useApp();
  const zero = useZero();
  const createUser = useServerFn(createUserAdmin);
  const [createdUserId, setCreatedUserId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const selectHasEmail = useEventCallback(
    (state: { values: { email: string } }) => state.values.email.trim() !== ""
  );

  const registerLoginVolunteer = useEventCallback(async (userId: string) => {
    const result = await zero.mutate(
      mutators.kalakritiAssignment.addVolunteers({
        auditEntryId: uuidv7(),
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
      const registered = await registerLoginVolunteer(createdUserId);
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
    defaultValues: { email: "", name: "", password: "", phone: "" },
    validators: {
      onChange: registerVolunteerCardSchema,
      onSubmit: registerVolunteerCardSchema,
    },
    onSubmit: async ({ value }) => {
      const email = value.email.trim();
      const phone = optionalContact(value.phone);
      onPendingChange(true);
      setSubmitError(null);

      if (!email) {
        try {
          const result = await zero.mutate(
            mutators.kalakritiAssignment.createLocalVolunteer({
              auditEntryId: uuidv7(),
              editionId,
              membershipId: printedCardId,
              name: value.name.trim(),
              now: Date.now(),
              requirePrintedCardId: true,
              snapshotEmail: null,
              snapshotPhone: phone,
            })
          ).server;
          handleMutationResult(result, {
            entityId: printedCardId,
            errorMsg: "Failed to create volunteer",
            mutation: "kalakritiAssignment.createLocalVolunteer",
            successMsg: "Volunteer card registered",
          });
          if (result.type !== "error") {
            onClose();
          }
        } finally {
          onPendingChange(false);
        }
        return;
      }

      if (!hasPermission("users.create")) {
        const message =
          "Creating a login requires permission to create users. Leave email blank to register without a login.";
        setSubmitError(message);
        toast.error(message);
        onPendingChange(false);
        return;
      }

      let userId: string;
      try {
        userId = await createUser({
          data: {
            email,
            name: value.name.trim(),
            password: value.password,
            phone: phone ?? undefined,
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
        const registered = await registerLoginVolunteer(userId);
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
          <p>The volunteer account was created.</p>
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
      <InputField isRequired label="Name" name="name" />
      <InputField label="Email" name="email" type="email" />
      <PhoneField defaultCountry="IN" label="Phone" name="phone" />
      <form.Subscribe selector={selectHasEmail}>
        {(hasEmail) =>
          hasEmail ? (
            <InputField
              isRequired
              label="Password"
              name="password"
              type="password"
            />
          ) : null
        }
      </form.Subscribe>
      <FormActions
        disabled={isPending}
        onCancel={handleClose}
        submitLabel="Register volunteer"
        submittingLabel="Registering volunteer..."
      />
    </FormLayout>
  );
}
