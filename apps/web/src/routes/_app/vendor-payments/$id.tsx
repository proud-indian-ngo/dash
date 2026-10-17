import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as z from "zod";

import { RecordNotFound } from "@/components/shared/not-found-state";
import { PageHeader } from "@/components/shared/page-header";
import { DetailPageSkeleton } from "@/components/shared/page-skeleton";
import { VendorPaymentDetail } from "@/components/vendor-payments/vendor-payment-detail";
import { VendorPaymentForm } from "@/components/vendor-payments/vendor-payment-form";
import { useApp } from "@/context/app-context";
import { useRecordTitle } from "@/hooks/use-record-title";
import { canEditVendorPaymentSubmission } from "@/lib/request-edit-permissions";
import { preloadRouteQuery } from "@/lib/route-preload";
import {
  mapLineItemsToFormValues,
  mapQuotationAttachmentsToFormValues,
} from "@/lib/submission-mappers";

export const Route = createFileRoute("/_app/vendor-payments/$id")({
  component: VendorPaymentDetailRouteComponent,
  head: () => ({
    meta: [{ title: `Vendor Payment Details | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context, params }) => {
    preloadRouteQuery(
      context.zero,
      queries.vendorPayment.byId({ id: params.id }),
      abortController.signal
    );
  },
  validateSearch: z.object({
    mode: z.enum(["edit"]).optional(),
  }),
});

function VendorPaymentEditPane({
  currentChargeProgramme,
  initialValues,
  onCancel,
  onSaved,
  onViewDetails,
}: {
  currentChargeProgramme: React.ComponentProps<
    typeof VendorPaymentForm
  >["currentChargeProgramme"];
  initialValues: React.ComponentProps<
    typeof VendorPaymentForm
  >["initialValues"];
  onCancel: () => void;
  onSaved: () => void;
  onViewDetails: () => void;
}) {
  return (
    <>
      <PageHeader
        actions={
          <Button onClick={onViewDetails} type="button" variant="outline">
            View details
          </Button>
        }
        description="Update submission details."
        title="Edit vendor payment"
      />
      <div className="mt-6">
        <VendorPaymentForm
          currentChargeProgramme={currentChargeProgramme}
          initialValues={initialValues}
          onCancel={onCancel}
          onSaved={onSaved}
        />
      </div>
    </>
  );
}

function VendorPaymentDetailRouteComponent() {
  const { id } = Route.useParams();
  const { session } = Route.useRouteContext();
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const { hasPermission } = useApp();

  const [vendorPayment, result] = useQuery(queries.vendorPayment.byId({ id }));
  useRecordTitle(vendorPayment?.title);

  const isLoading = !vendorPayment && result.type !== "complete";
  const setEditMode = (enabled: boolean) => {
    navigate({
      params: { id },
      replace: true,
      search: enabled ? { mode: "edit" } : {},
      to: "/vendor-payments/$id",
    });
  };
  const stableOnCancel0 = useEventCallback(() => {
    navigate({ to: "/vendor-payments" });
  });
  const stableOnSaved1 = useEventCallback(() => {
    setEditMode(false);
  });
  const stableOnViewDetails2 = useEventCallback(() => setEditMode(false));
  const stableOnClick3 = useEventCallback(() => setEditMode(true));

  if (isLoading) {
    return (
      <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
        <DetailPageSkeleton />
      </div>
    );
  }

  if (!vendorPayment) {
    return (
      <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
        <RecordNotFound
          backLabel="Back to vendor payments"
          backTo="/vendor-payments"
          noun="Vendor payment"
        />
      </div>
    );
  }

  const canEditAnyStatus = hasPermission("requests.edit_all_statuses");
  const canApprove = hasPermission("requests.approve");
  const isOwner = vendorPayment.userId === session.user.id;
  const canEdit = canEditVendorPaymentSubmission(
    vendorPayment,
    session.user.id,
    hasPermission
  );
  const showEditForm = canEdit && mode === "edit";

  const initialValues = {
    attachments: mapQuotationAttachmentsToFormValues(vendorPayment.attachments),
    // Its own city; one on an event takes the event's.
    costCentreId: vendorPayment.costCentreId ?? undefined,
    id: vendorPayment.id as string,
    lineItems: mapLineItemsToFormValues(vendorPayment.lineItems),
    title: vendorPayment.title as string,
    vendorId: vendorPayment.vendorId as string,
    ...(vendorPayment.eventId ? { eventId: vendorPayment.eventId } : {}),
    chargedProgrammeId: vendorPayment.chargedProgrammeId ?? undefined,
    chargedProjectId: vendorPayment.chargedProjectId ?? undefined,
    chargedTo: vendorPayment.chargedTo,
  };
  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <div
        className="fade-in-0 animate-in duration-150 ease-(--ease-out-expo)"
        key={showEditForm ? "edit" : "view"}
      >
        {showEditForm ? (
          <VendorPaymentEditPane
            currentChargeProgramme={vendorPayment.chargedProgramme ?? null}
            initialValues={initialValues}
            onCancel={stableOnCancel0}
            onSaved={stableOnSaved1}
            onViewDetails={stableOnViewDetails2}
          />
        ) : (
          <VendorPaymentDetail
            canApprove={canApprove}
            canUpdateAnyStatus={canEditAnyStatus}
            isOwner={isOwner}
            onEdit={canEdit ? stableOnClick3 : undefined}
            request={vendorPayment}
          />
        )}
      </div>
    </div>
  );
}
