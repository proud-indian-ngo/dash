import {
  Delete02Icon,
  Edit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { DataGridColumnHeader } from "@pi-dash/design-system/components/reui/data-grid/data-grid-column-header";
import type { DataGridColumnDef } from "@pi-dash/design-system/components/reui/data-grid/data-grid-features";
import type { FilterField } from "@pi-dash/design-system/components/reui/filters/filters-types";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
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

import { DataTableWrapper } from "@/components/data-table/data-table-wrapper";
import { selectField } from "@/components/data-table/filter-fields";
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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { ResponsiveActionMenu } from "@/components/shared/responsive-action-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { RowActionsButton } from "@/components/shared/row-actions-button";
import { StatusBadge, type StatusTone } from "@/components/shared/status-badge";
import { useApp } from "@/context/app-context";
import { useConfirmAction } from "@/hooks/use-confirm-action";
import {
  getMutationResultErrorMessage,
  handleMutationResult,
} from "@/lib/mutation-result";
import { assertAnyPermission } from "@/lib/route-guards";
import { preloadRouteQuery } from "@/lib/route-preload";
import { isAwaitingResult } from "@/lib/zero-result";

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

type Validity = "expired" | "no_expiry" | "renew" | "valid";

interface RegistrationRow extends Registration {
  validity: Validity;
}

const VALIDITY_LABELS: Record<Validity, string> = {
  expired: "Expired",
  no_expiry: "No expiry",
  renew: "Renew soon",
  valid: "Valid",
};

const VALIDITY_TONES: Record<Validity, StatusTone> = {
  expired: "danger",
  no_expiry: "neutral",
  renew: "warning",
  valid: "success",
};

function validityOf(registration: Registration, today: string): Validity {
  if (!registration.validTo) {
    return "no_expiry";
  }
  if (registration.validTo < today) {
    return "expired";
  }
  if (registration.validTo <= addDays(today, 180)) {
    return "renew";
  }
  return "valid";
}

const filterFields: FilterField[] = [
  selectField("type", "Registration", typeOptions),
  selectField(
    "validity",
    "Status",
    Object.entries(VALIDITY_LABELS).map(([value, label]) => ({
      label,
      value,
    }))
  ),
];

function getFilterValue(row: RegistrationRow, path: string[]): unknown {
  switch (path[0]) {
    case "type":
      return row.type;
    case "validity":
      return row.validity;
    default:
      return;
  }
}

function searchRegistration(row: RegistrationRow, query: string): boolean {
  return [REGISTRATION_TYPE_LABELS[row.type], row.number, row.scopeNote ?? ""]
    .join(" ")
    .toLowerCase()
    .includes(query.trim().toLowerCase());
}

function getRowId(row: RegistrationRow) {
  return row.id;
}

const SKELETON_TEXT = <Skeleton className="h-5 w-32" />;
const SKELETON_BADGE = <Skeleton className="h-5.5 w-20" />;

function RegistrationsPage() {
  const { hasPermission } = useApp();
  const canManage =
    hasPermission("governance.manage") || hasPermission("finance.manage");
  const [rows, result] = useQuery(queries.organisationRegistration.all());
  const isLoading = rows.length === 0 && isAwaitingResult(result);
  const { documents } = useGovernanceDocuments();
  const today = todayIso();
  const registrations: RegistrationRow[] = rows.map((r) => {
    const registration: Registration = {
      certificateDocumentId: r.certificateDocumentId ?? null,
      id: r.id,
      issuedOn: epochToIso(r.issuedOn),
      number: r.number,
      scopeNote: r.scopeNote ?? null,
      type: r.type,
      validFrom: epochToIso(r.validFrom),
      validTo: epochToIso(r.validTo),
    };
    return { ...registration, validity: validityOf(registration, today) };
  });
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
  const openEdit = useEventCallback((registration: Registration) => {
    setEditing(registration);
    setOpen(true);
  });
  const zero = useZero();
  const deleteAction = useConfirmAction<Registration>({
    onConfirm: async (registration) => {
      const result = await zero.mutate(
        mutators.organisationRegistration.delete({ id: registration.id })
      ).server;
      handleMutationResult(result, {
        entityId: registration.id,
        errorMsg: `Couldn't delete: ${getMutationResultErrorMessage(result.type === "error" ? result.error : undefined, "something went wrong")}`,
        mutation: "organisationRegistration.delete",
        successMsg: "Registration deleted",
      });
      return result;
    },
  });
  const deleting = deleteAction.payload;
  const closeDelete = useEventCallback((next: boolean) => {
    if (!next) {
      deleteAction.cancel();
    }
  });

  const columns: DataGridColumnDef<RegistrationRow>[] = [
    {
      accessorFn: (row) => REGISTRATION_TYPE_LABELS[row.type],
      cell: ({ row }) => (
        <span className="truncate font-medium">
          {REGISTRATION_TYPE_LABELS[row.original.type]}
        </span>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Registration"
          visibility={true}
        />
      ),
      id: "type",
      meta: {
        compact: "primary",
        headerTitle: "Registration",
        kind: "text",
        skeleton: SKELETON_TEXT,
      },
      size: 200,
    },
    {
      accessorFn: (row) => row.number,
      cell: ({ row }) => row.original.number,
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Number"
          visibility={true}
        />
      ),
      id: "number",
      meta: {
        compact: "primary",
        headerTitle: "Number",
        kind: "id",
        skeleton: SKELETON_TEXT,
      },
      size: 200,
    },
    {
      accessorFn: (row) => row.validTo ?? "",
      cell: ({ row }) =>
        row.original.validFrom || row.original.validTo
          ? `${formatIso(row.original.validFrom)} to ${formatIso(row.original.validTo)}`
          : "—",
      header: ({ column }) => (
        <DataGridColumnHeader column={column} title="Valid" visibility={true} />
      ),
      id: "valid",
      meta: { headerTitle: "Valid", kind: "date", skeleton: SKELETON_TEXT },
      size: 240,
    },
    {
      accessorFn: (row) => row.validity,
      cell: ({ row }) => (
        <StatusBadge tone={VALIDITY_TONES[row.original.validity]}>
          {row.original.validity === "renew"
            ? `Renew by ${formatIso(row.original.validTo)}`
            : VALIDITY_LABELS[row.original.validity]}
        </StatusBadge>
      ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Status"
          visibility={true}
        />
      ),
      id: "validity",
      meta: {
        compact: "primary",
        headerTitle: "Status",
        kind: "status",
        skeleton: SKELETON_BADGE,
      },
      size: 170,
    },
    {
      accessorFn: (row) => (row.certificateDocumentId ? 1 : 0),
      cell: ({ row }) =>
        row.original.certificateDocumentId ? (
          <EvidenceLink
            documentId={row.original.certificateDocumentId}
            documents={documents}
          />
        ) : (
          "—"
        ),
      header: ({ column }) => (
        <DataGridColumnHeader
          column={column}
          title="Certificate"
          visibility={true}
        />
      ),
      id: "certificate",
      meta: {
        headerTitle: "Certificate",
        kind: "link",
        skeleton: SKELETON_TEXT,
        stopRowClick: true,
      },
      size: 220,
    },
    ...(canManage
      ? [
          {
            cell: ({ row }) => (
              <ResponsiveActionMenu
                actions={[
                  {
                    icon: Edit02Icon,
                    id: "edit",
                    label: "Edit",
                    onSelect: () => openEdit(row.original),
                  },
                  {
                    destructive: true,
                    icon: Delete02Icon,
                    id: "delete",
                    label: "Delete",
                    onSelect: () => deleteAction.trigger(row.original),
                  },
                ]}
                title={`${REGISTRATION_TYPE_LABELS[row.original.type]} actions`}
                trigger={<RowActionsButton />}
              />
            ),
            enableHiding: false,
            enableResizing: false,
            enableSorting: false,
            header: "",
            id: "actions",
            meta: {
              cellClassName: "text-center",
              enableColumnOrdering: false,
              headerTitle: "",
              skeleton: <Skeleton className="size-7" />,
              stopRowClick: true,
            },
            minSize: 52,
            size: 52,
          } satisfies DataGridColumnDef<RegistrationRow>,
        ]
      : []),
  ];

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
        <DataTableWrapper
          columns={columns}
          compactOnMobile
          data={registrations}
          emptyMessage={
            registrations.length === 0
              ? "No registrations recorded yet."
              : "No registrations match."
          }
          filter={{ fields: filterFields, getValue: getFilterValue }}
          getRowId={getRowId}
          isLoading={isLoading}
          onRowClick={canManage ? openEdit : undefined}
          searchFn={searchRegistration}
          searchPlaceholder="Search registrations..."
          storageKey="governance_registrations_table_state_v1"
          tableLayout={{
            columnsDraggable: true,
            columnsPinnable: true,
            columnsResizable: true,
            columnsVisibility: true,
          }}
        />
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
      <ConfirmDialog
        confirmLabel="Delete registration"
        description={`Delete the ${deleting ? REGISTRATION_TYPE_LABELS[deleting.type] : ""} registration ${deleting?.number ?? ""}? Use this only for one added by mistake. Its open renewal items on the compliance calendar go with it; its certificate stays in the vault.`}
        loading={deleteAction.isLoading}
        loadingLabel="Deleting..."
        onConfirm={deleteAction.confirm}
        onOpenChange={closeDelete}
        open={deleteAction.isOpen}
        title="Delete this registration?"
      />
    </div>
  );
}
