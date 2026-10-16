import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { ExpenseCategory, TeamEvent, Vendor } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { format } from "date-fns";
import { useMemo, useState } from "react";
import { uuidv7 } from "uuidv7";

import { AppErrorBoundary } from "@/components/app-error-boundary";
import type { CurrentChargeProgramme } from "@/components/expenses/charged-to-fields";
import { chargedToPayload } from "@/components/expenses/charged-to-schema";
import { useRequestCity } from "@/components/expenses/use-request-city";
import { FormLayout } from "@/components/form/form-layout";
import { DATE } from "@/lib/date-formats";
import { newLineItem, toLineItemsPayload } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";

import { VendorPaymentFields } from "./vendor-payment-fields";
import {
  createVendorPaymentFormSchema,
  getVendorPaymentDefaultValues,
  type VendorPaymentFormValues,
} from "./vendor-payment-form.schema";

export interface VendorPaymentFormProps {
  /** The programme the request is charged to, kept listed when editing. */
  currentChargeProgramme?: CurrentChargeProgramme | null;
  initialValues?: Partial<VendorPaymentFormValues> & { id?: string };
  onCancel: () => void;
  onSaved: (id: string) => void;
}

export function VendorPaymentForm({
  currentChargeProgramme,
  initialValues,
  onCancel,
  onSaved,
}: VendorPaymentFormProps) {
  const zero = useZero();
  const [categories] = useQuery(queries.expenseCategory.all());
  const [vendors] = useQuery(queries.vendor.approved());
  const [pendingVendors] = useQuery(queries.vendor.pendingByCurrentUser());
  const [events] = useQuery(queries.teamEvent.allAccessible());

  const existingId = initialValues?.id;
  const isEdit = !!existingId;
  const entityId = existingId ?? uuidv7();

  const categoryList = (categories ?? []) as ExpenseCategory[];
  const approvedVendorList = (vendors ?? []) as Vendor[];
  const pendingVendorList = (pendingVendors ?? []) as Vendor[];

  const vendorList = [...approvedVendorList, ...pendingVendorList].sort(
    (a, b) => a.name.localeCompare(b.name)
  );

  const vendorOptions = vendorList.map((v) => ({
    label: v.status === "pending" ? `${v.name} (pending approval)` : v.name,
    value: v.id,
  }));

  const eventList = (events ?? []) as TeamEvent[];
  const { cityOptions, defaultCostCentreId, listsEvent } = useRequestCity(
    initialValues,
    isEdit
  );
  const eventOptions = eventList.filter(listsEvent).map((e) => ({
    label: `${e.name} (${format(new Date(e.startTime), DATE)})`,
    value: e.id,
  }));
  const vendorPaymentFormSchema = useMemo(
    () => createVendorPaymentFormSchema(cityOptions.length > 1),
    [cityOptions.length]
  );

  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);

  const form = useForm({
    defaultValues: {
      ...getVendorPaymentDefaultValues(),
      ...initialValues,
      ...(defaultCostCentreId ? { costCentreId: defaultCostCentreId } : {}),
      attachments: initialValues?.attachments ?? [],
      lineItems: initialValues?.lineItems ?? [newLineItem()],
    },
    onSubmit: async ({ value: rawValue }) => {
      const value = vendorPaymentFormSchema.parse(rawValue);
      const id = entityId;

      const lineItems = toLineItemsPayload(value.lineItems);

      const payload = {
        attachments: value.attachments,
        // On an event the payment takes the event's city, so none is sent.
        costCentreId:
          value.chargedTo === "event"
            ? undefined
            : value.costCentreId || undefined,
        ...chargedToPayload(value),
        id,
        lineItems,
        title: value.title,
        vendorId: value.vendorId,
      };

      const mutation = existingId
        ? zero.mutate(mutators.vendorPayment.update(payload))
        : zero.mutate(mutators.vendorPayment.create(payload));

      const res = await mutation.server;
      handleMutationResult(res, {
        entityId: id,
        errorMsg: "Couldn't submit vendor payment",
        mutation: `vendorPayment.${existingId ? "update" : "create"}`,
        successMsg: "Vendor payment submitted",
      });
      if (res.type !== "error") {
        onSaved(id);
      }
    },
    validators: {
      onChange: vendorPaymentFormSchema,
      onSubmit: vendorPaymentFormSchema,
    },
  });
  const stableSelector0 = useEventCallback(
    (state: { values: { chargedTo?: string } }) => state.values.chargedTo
  );
  const handleVendorCreated = useEventCallback((id: string) =>
    form.setFieldValue("vendorId", id)
  );
  const handleVendorDialogOpenChange = useEventCallback((open: boolean) =>
    setVendorDialogOpen(open)
  );

  return (
    <AppErrorBoundary level="section">
      <FormLayout className="flex flex-col gap-4" form={form}>
        <form.Subscribe selector={stableSelector0}>
          {(chargedTo) => {
            // On an event, the payment takes the event's city: no picker.
            const showsCity = cityOptions.length > 1 && chargedTo !== "event";
            return (
              <VendorPaymentFields
                categoryList={categoryList}
                cityOptions={showsCity ? cityOptions : []}
                currentChargeProgramme={currentChargeProgramme}
                eventOptions={eventOptions}
                isEdit={isEdit}
                onCancel={onCancel}
                onVendorCreated={handleVendorCreated}
                onVendorDialogOpenChange={handleVendorDialogOpenChange}
                vendorDialogOpen={vendorDialogOpen}
                vendorOptions={vendorOptions}
              />
            );
          }}
        </form.Subscribe>
      </FormLayout>
    </AppErrorBoundary>
  );
}
