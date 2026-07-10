import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { ExpenseCategory, TeamEvent, Vendor } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { useForm } from "@tanstack/react-form";
import { format } from "date-fns";
import { useState } from "react";
import { uuidv7 } from "uuidv7";
import { AppErrorBoundary } from "@/components/app-error-boundary";
import { FormLayout } from "@/components/form/form-layout";
import { newLineItem } from "@/lib/form-schemas";
import { handleMutationResult } from "@/lib/mutation-result";
import { VendorPaymentFields } from "./vendor-payment-fields";
import {
  getVendorPaymentDefaultValues,
  type VendorPaymentFormValues,
  vendorPaymentFormSchema,
} from "./vendor-payment-form.schema";

export interface VendorPaymentFormProps {
  initialValues?: Partial<VendorPaymentFormValues> & { id?: string };
  onCancel: () => void;
  onSaved: (id: string) => void;
}

export function VendorPaymentForm({
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

  function getFilteredEventOptions(selectedCity: string | undefined) {
    const filtered = selectedCity
      ? eventList.filter((e) => e.city === selectedCity)
      : eventList;
    return filtered.map((e) => ({
      label: `${e.name} (${format(new Date(e.startTime), "MMM d, yyyy")})`,
      value: e.id,
    }));
  }

  const [vendorDialogOpen, setVendorDialogOpen] = useState(false);

  const form = useForm({
    defaultValues: {
      ...getVendorPaymentDefaultValues(),
      ...initialValues,
      attachments: initialValues?.attachments ?? [],
      lineItems: initialValues?.lineItems ?? [newLineItem()],
    },
    onSubmit: async ({ value: rawValue }) => {
      const value = vendorPaymentFormSchema.parse(rawValue);
      const id = entityId;

      const lineItems = value.lineItems.map((item, index) => ({
        ...item,
        amount: Number(item.amount),
        sortOrder: index,
      }));

      const payload = {
        attachments: value.attachments,
        city: value.city,
        eventId: value.eventId ?? undefined,
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
    (state: { values: { city?: string; eventId?: string } }) => ({
      city: state.values.city,
      eventId: state.values.eventId,
    })
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
          {({ city: selectedCity, eventId }) => {
            const filteredOptions = getFilteredEventOptions(selectedCity);
            if (eventId && !filteredOptions.some((o) => o.value === eventId)) {
              setTimeout(() => form.setFieldValue("eventId", undefined), 0);
            }
            return (
              <VendorPaymentFields
                categoryList={categoryList}
                eventOptions={filteredOptions}
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
