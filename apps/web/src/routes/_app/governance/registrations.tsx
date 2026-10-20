import { PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pi-dash/design-system/components/ui/table";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import {
  type OrganisationRegistrationType,
  organisationRegistrationTypeValues,
} from "@pi-dash/shared/constants";
import {
  addDays,
  REGISTRATIONS_PAGE_PERMISSIONS,
} from "@pi-dash/shared/governance";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { uuidv7 } from "uuidv7";

import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { SelectField } from "@/components/form/select-field";
import { TextareaField } from "@/components/form/textarea-field";
import {
  documentOptions,
  EvidenceLink,
  fromDocumentOption,
  NO_DOCUMENT,
} from "@/components/governance/evidence";
import {
  dateToIso,
  epochToIso,
  formatIso,
  isoToDate,
  todayIso,
  useGovernanceDocuments,
} from "@/components/governance/register-data";
import { PageHeader } from "@/components/shared/page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { useApp } from "@/context/app-context";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";
import { assertAnyPermission } from "@/lib/route-guards";
import { preloadRouteQuery } from "@/lib/route-preload";

export const Route = createFileRoute("/_app/governance/registrations")({
  beforeLoad: ({ context }) =>
    assertAnyPermission(context, ...REGISTRATIONS_PAGE_PERMISSIONS),
  component: RegistrationsPage,
  head: () => ({
    meta: [{ title: `Registrations | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context }) => {
    preloadRouteQuery(
      context.zero,
      queries.organisationRegistration.all(),
      abortController.signal
    );
  },
});

const REGISTRATION_TYPE_LABELS: Record<OrganisationRegistrationType, string> = {
  "12ab": "12AB registration",
  "80g": "80G approval",
  csr1: "CSR-1 registration",
  darpan: "NGO Darpan ID",
  fcra: "FCRA registration",
  pan: "PAN",
  tan: "TAN",
};

/** Far enough ahead for a registration's end. */
const FUTURE_MONTH = new Date(2100, 11, 1);

const typeOptions = organisationRegistrationTypeValues.map((value) => ({
  label: REGISTRATION_TYPE_LABELS[value],
  value,
}));

interface Registration {
  certificateDocumentId: string | null;
  id: string;
  issuedOn: string | null;
  number: string;
  scopeNote: string | null;
  type: OrganisationRegistrationType;
  validFrom: string | null;
  validTo: string | null;
}

interface Values {
  certificateDocumentId: string;
  issuedOn: Date | undefined;
  number: string;
  scopeNote: string;
  type: OrganisationRegistrationType;
  validFrom: Date | undefined;
  validTo: Date | undefined;
}

function RegistrationForm({
  onDone,
  registration,
}: {
  onDone: () => void;
  registration: Registration | null;
}) {
  const zero = useZero();
  const { hasPermission } = useApp();
  const { documents } = useGovernanceDocuments();
  const canPickCertificate =
    hasPermission("governance.view") || hasPermission("governance.manage");
  const form = useForm({
    defaultValues: {
      certificateDocumentId: registration?.certificateDocumentId ?? NO_DOCUMENT,
      issuedOn: isoToDate(registration?.issuedOn),
      number: registration?.number ?? "",
      scopeNote: registration?.scopeNote ?? "",
      type: registration?.type ?? "80g",
      validFrom: isoToDate(registration?.validFrom),
      validTo: isoToDate(registration?.validTo),
    } as Values,
    onSubmit: async ({ value }) => {
      if (!value.number.trim()) {
        toast.error("Enter the registration number.");
        return;
      }
      const args = {
        certificateDocumentId: canPickCertificate
          ? fromDocumentOption(value.certificateDocumentId)
          : undefined,
        id: registration?.id ?? uuidv7(),
        issuedOn: dateToIso(value.issuedOn),
        number: value.number.trim(),
        scopeNote: value.scopeNote.trim() || null,
        type: value.type,
        validFrom: dateToIso(value.validFrom),
        validTo: dateToIso(value.validTo),
      };
      const result = await zero.mutate(
        registration
          ? mutators.organisationRegistration.update(args)
          : mutators.organisationRegistration.create(args)
      ).server;
      handleMutationResult(result, {
        entityId: args.id,
        errorMsg: `Couldn't save the registration: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
        mutation: registration
          ? "organisationRegistration.update"
          : "organisationRegistration.create",
        successMsg: registration
          ? "Registration updated"
          : "Registration added",
      });
      if (result.type !== "error") {
        onDone();
      }
    },
  });
  const cancel = useEventCallback(onDone);
  return (
    <FormLayout form={form}>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          isRequired
          label="Type"
          name="type"
          options={typeOptions}
        />
        <InputField isRequired label="Number" name="number" />
        <DateField endMonth={FUTURE_MONTH} label="Issued on" name="issuedOn" />
        <DateField
          endMonth={FUTURE_MONTH}
          label="Valid from"
          name="validFrom"
        />
        <DateField
          endMonth={FUTURE_MONTH}
          description="Leave empty if it doesn't expire."
          label="Valid to"
          name="validTo"
        />
      </div>
      {canPickCertificate ? (
        <SelectField
          description="Upload the certificate on the Documents page first."
          label="Certificate"
          name="certificateDocumentId"
          options={documentOptions(
            documents.filter((d) => d.kind === "registration_certificate")
          )}
        />
      ) : null}
      <TextareaField
        description="For FCRA, the permitted activities and States/UTs."
        label="Scope note"
        name="scopeNote"
        rows={2}
      />
      <FormActions
        disableWhenInvalid={false}
        onCancel={cancel}
        submitLabel={registration ? "Save changes" : "Add registration"}
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

function validity(registration: Registration, today: string) {
  if (!registration.validTo) {
    return <Badge variant="secondary">No expiry</Badge>;
  }
  if (registration.validTo < today) {
    return <Badge variant="destructive">Expired</Badge>;
  }
  if (registration.validTo <= addDays(today, 180)) {
    return (
      <Badge className="text-warning-foreground" variant="outline">
        Renew by {formatIso(registration.validTo)}
      </Badge>
    );
  }
  return <Badge variant="secondary">Valid</Badge>;
}

function RegistrationsPage() {
  const { hasPermission } = useApp();
  const canManage =
    hasPermission("governance.manage") || hasPermission("finance.manage");
  const [rows] = useQuery(queries.organisationRegistration.all());
  const { documents } = useGovernanceDocuments();
  const registrations: Registration[] = rows.map((r) => ({
    certificateDocumentId: r.certificateDocumentId ?? null,
    id: r.id,
    issuedOn: epochToIso(r.issuedOn),
    number: r.number,
    scopeNote: r.scopeNote ?? null,
    type: r.type,
    validFrom: epochToIso(r.validFrom),
    validTo: epochToIso(r.validTo),
  }));
  const [editing, setEditing] = useState<Registration | null>(null);
  const [open, setOpen] = useState(false);
  const openCreate = useEventCallback(() => {
    setEditing(null);
    setOpen(true);
  });
  const close = useEventCallback(() => {
    setOpen(false);
    setEditing(null);
  });
  const today = todayIso();

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <PageHeader
        actions={
          canManage ? (
            <Button onClick={openCreate} type="button">
              <HugeiconsIcon
                className="size-4"
                icon={PlusSignIcon}
                strokeWidth={2}
              />
              Add registration
            </Button>
          ) : null
        }
        description="The trust's PAN, TAN, 12AB, 80G, CSR-1, FCRA and Darpan registrations, with their certificates and validity."
        title="Registrations"
      />
      <div className="mt-6">
        {registrations.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No registrations recorded yet.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Registration</TableHead>
                  <TableHead>Number</TableHead>
                  <TableHead>Valid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Certificate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registrations.map((registration) => (
                  <TableRow
                    className={canManage ? "cursor-pointer" : undefined}
                    key={registration.id}
                    onClick={
                      canManage
                        ? () => {
                            setEditing(registration);
                            setOpen(true);
                          }
                        : undefined
                    }
                  >
                    <TableCell className="font-medium">
                      {REGISTRATION_TYPE_LABELS[registration.type]}
                    </TableCell>
                    <TableCell>{registration.number}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {registration.validFrom || registration.validTo
                        ? `${formatIso(registration.validFrom)} to ${formatIso(registration.validTo)}`
                        : "—"}
                    </TableCell>
                    <TableCell>{validity(registration, today)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {registration.certificateDocumentId ? (
                        <EvidenceLink
                          documentId={registration.certificateDocumentId}
                          documents={documents}
                        />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <Dialog
        onOpenChange={(next) => (next ? setOpen(true) : close())}
        open={open}
      >
        <DialogContent className="sm:max-w-(--dialog-lg)">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit registration" : "Add registration"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              The trust's registration and its certificate
            </DialogDescription>
          </DialogHeader>
          {open ? (
            <RegistrationForm
              key={editing?.id ?? "new"}
              onDone={close}
              registration={editing}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
