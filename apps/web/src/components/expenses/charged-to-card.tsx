import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { ExpenseChargedTo } from "@pi-dash/shared/constants";
import { EXPENSE_CHARGED_TO_LABELS } from "@pi-dash/shared/expense-charge";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { useState } from "react";
import z from "zod";

import {
  ChargedToFields,
  type CurrentChargeProgramme,
} from "@/components/expenses/charged-to-fields";
import {
  chargedToFormFields,
  chargedToPayload,
  refineChargedTo,
} from "@/components/expenses/charged-to-schema";
import { ComboboxField } from "@/components/form/combobox-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { FormModal } from "@/components/form/form-modal";
import { DetailsCard, DetailsRow } from "@/components/shared/record-detail";
import { useApp } from "@/context/app-context";
import { DATE } from "@/lib/date-formats";
import { handleMutationResult } from "@/lib/mutation-result";
import {
  type ChargedRequest,
  requestProgrammeName,
} from "@/lib/request-programme";

type ChargeKind = "reimbursement" | "vendorPayment";

/** A request with what it is charged to, as the detail pages load it. */
export interface ChargedRequestDetail extends ChargedRequest {
  chargedProgramme?: (CurrentChargeProgramme & { name: string }) | null;
  chargedTo: ExpenseChargedTo;
  event?: {
    id: string;
    name: string;
    programme?: { name: string } | null;
    programmeId?: string | null;
  } | null;
  eventId?: string | null;
  id: string;
}

const changeSchema = z.object(chargedToFormFields).superRefine(refineChargedTo);

/** Finance changes the charge: whoever approves requests, or finance.manage. */
export function useCanChangeCharge(): boolean {
  const { hasPermission } = useApp();
  return hasPermission("requests.approve") || hasPermission("finance.manage");
}

function ChangeChargedToForm({
  kind,
  onOpenChange,
  request,
}: {
  kind: ChargeKind;
  onOpenChange: (open: boolean) => void;
  request: ChargedRequestDetail;
}) {
  const zero = useZero();
  const [events] = useQuery(queries.teamEvent.allAccessible());
  const eventOptions = events.map((e) => ({
    label: `${e.name} (${format(new Date(e.startTime), DATE)})`,
    value: e.id,
  }));
  if (
    request.event &&
    !eventOptions.some((o) => o.value === request.event?.id)
  ) {
    eventOptions.push({ label: request.event.name, value: request.event.id });
  }

  const form = useForm({
    defaultValues: {
      chargedProgrammeId: request.chargedProgrammeId ?? undefined,
      chargedProjectId: request.chargedProjectId ?? undefined,
      chargedTo: request.chargedTo,
      eventId: request.eventId ?? undefined,
    } as z.input<typeof changeSchema>,
    onSubmit: async ({ value: rawValue }) => {
      const value = changeSchema.parse(rawValue);
      const args = { id: request.id, ...chargedToPayload(value) };
      const mutation =
        kind === "reimbursement"
          ? mutators.reimbursement.setChargedTo(args)
          : mutators.vendorPayment.setChargedTo(args);
      const res = await zero.mutate(mutation).server;
      handleMutationResult(res, {
        entityId: request.id,
        errorMsg: "Couldn't change what this is charged to",
        mutation: `${kind}.setChargedTo`,
        successMsg: "Charged to updated",
      });
      if (res.type !== "error") {
        onOpenChange(false);
      }
    },
    validators: { onChange: changeSchema, onSubmit: changeSchema },
  });
  const handleCancel = useEventCallback(() => onOpenChange(false));

  return (
    <FormLayout form={form}>
      <ChargedToFields
        currentProgramme={request.chargedProgramme ?? null}
        eventField={
          <ComboboxField
            emptyMessage="No matching events."
            isRequired
            label="Event"
            name="eventId"
            options={eventOptions}
            placeholder="Search events"
          />
        }
      />
      <FormActions
        cancelLabel="Cancel"
        onCancel={handleCancel}
        submitLabel="Save"
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}

/**
 * What a request is charged to, in the detail aside. Finance changes it here,
 * at approval or later; the claimant changes it by editing while pending.
 */
export function ChargedToCard({
  kind,
  request,
}: {
  kind: ChargeKind;
  request: ChargedRequestDetail;
}) {
  const canChange = useCanChangeCharge();
  const { hasPermission } = useApp();
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);
  // Project rows carry sponsor terms, so only finance.view syncs them.
  const [projects] = useQuery(queries.project.all(), {
    enabled: hasPermission("finance.view") && Boolean(request.chargedProjectId),
  });
  const project = projects.find((p) => p.id === request.chargedProjectId);
  const programmeName = requestProgrammeName(request);

  const handleOpenChange = useEventCallback((next: boolean) => {
    if (next) {
      setFormKey((k) => k + 1);
    }
    setOpen(next);
  });
  const handleChange = useEventCallback(() => handleOpenChange(true));

  return (
    <DetailsCard title="Charged to">
      <DetailsRow label="Charged to">
        {EXPENSE_CHARGED_TO_LABELS[request.chargedTo]}
      </DetailsRow>
      {request.chargedTo === "event" && request.event ? (
        <DetailsRow label="Event">
          <Link
            className="text-primary font-medium underline-offset-2 hover:underline"
            params={{ id: request.event.id }}
            to="/events/$id"
          >
            {request.event.name}
          </Link>
        </DetailsRow>
      ) : null}
      {request.chargedTo === "organisation" ? null : (
        <DetailsRow label="Programme">{programmeName || "—"}</DetailsRow>
      )}
      {project ? <DetailsRow label="Project">{project.name}</DetailsRow> : null}
      {canChange ? (
        <div>
          <Button
            onClick={handleChange}
            size="sm"
            type="button"
            variant="outline"
          >
            Change
          </Button>
        </div>
      ) : null}
      <FormModal
        description="Which work this expense served. Change it before approving if the claimant picked the wrong one."
        onOpenChange={handleOpenChange}
        open={open}
        size="md"
        title="Change what this is charged to"
      >
        <ChangeChargedToForm
          key={formKey}
          kind={kind}
          onOpenChange={handleOpenChange}
          request={request}
        />
      </FormModal>
    </DetailsCard>
  );
}
