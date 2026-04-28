import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { INVOICE_LOCKED_STATUSES } from "@pi-dash/zero/vendor-payment-constants";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader } from "@/components/loader";
import { VendorPaymentDetail } from "@/components/vendor-payments/vendor-payment-detail";
import { VendorPaymentForm } from "@/components/vendor-payments/vendor-payment-form";
import { useApp } from "@/context/app-context";
import {
  mapAttachmentsToFormValues,
  mapLineItemsToFormValues,
} from "@/lib/submission-mappers";

export const Route = createFileRoute("/_app/vendor-payments/$id")({
  head: () => ({
    meta: [{ title: `Vendor Payment Details | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context, params }) => {
    context.zero?.preload(queries.vendorPayment.byId({ id: params.id }));
  },
  component: VendorPaymentDetailRouteComponent,
});

function VendorPaymentDetailRouteComponent() {
  const { id } = Route.useParams();
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  const [adminEditMode, setAdminEditMode] = useState(false);
  const { hasPermission } = useApp();

  const [vendorPayment, result] = useQuery(queries.vendorPayment.byId({ id }));

  const isLoading = !vendorPayment && result.type !== "complete";

  if (isLoading) {
    return (
      <div className="app-container mx-auto max-w-3xl px-2 py-6 sm:px-4">
        <Loader />
      </div>
    );
  }

  if (!vendorPayment) {
    return (
      <div className="app-container mx-auto max-w-3xl px-2 py-6 sm:px-4">
        <p className="text-muted-foreground text-sm">
          Vendor payment not found.
        </p>
      </div>
    );
  }

  const canEditAll = hasPermission("requests.edit_all");
  const canApprove = hasPermission("requests.approve");
  const isPending = vendorPayment.status === "pending";
  const isInvoiceLocked = INVOICE_LOCKED_STATUSES.has(
    vendorPayment.status as string
  );
  const isOwner = vendorPayment.userId === session.user.id;
  const canEdit = (canEditAll && !isInvoiceLocked) || (isPending && isOwner);
  const showAdminActions = canApprove && isPending;
  const ownerEditingPending = canEdit && !canEditAll && !showAdminActions;
  const showEditForm = ownerEditingPending || (canEdit && adminEditMode);

  const initialValues = {
    id: vendorPayment.id as string,
    title: vendorPayment.title as string,
    city: vendorPayment.city as "bangalore" | "mumbai",
    vendorId: vendorPayment.vendorId as string,
    eventId: vendorPayment.eventId ?? undefined,
    lineItems: mapLineItemsToFormValues(vendorPayment.lineItems ?? []),
    attachments: mapAttachmentsToFormValues(vendorPayment.attachments ?? []),
  };

  return (
    <div className="app-container mx-auto max-w-3xl px-2 py-6 sm:px-4">
      <div
        className="fade-in-0 animate-in duration-150 ease-(--ease-out-expo)"
        key={showEditForm ? "edit" : "view"}
      >
        {showEditForm ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <h1 className="font-display font-semibold text-2xl tracking-tight">
                Edit Vendor Payment
              </h1>
              {canEdit && !ownerEditingPending ? (
                <Button
                  onClick={() => setAdminEditMode(false)}
                  type="button"
                  variant="outline"
                >
                  View details
                </Button>
              ) : null}
            </div>
            <p className="mt-2 text-muted-foreground text-sm">
              Update your submission before it is reviewed.
            </p>
            <div className="mt-6">
              <VendorPaymentForm
                initialValues={initialValues}
                onCancel={() => {
                  navigate({ to: "/vendor-payments" });
                }}
                onSaved={() => {
                  setAdminEditMode(false);
                }}
              />
            </div>
          </>
        ) : (
          <>
            {canEdit ? (
              <div className="mb-4 flex justify-end">
                <Button
                  onClick={() => setAdminEditMode(true)}
                  type="button"
                  variant="outline"
                >
                  Edit submission
                </Button>
              </div>
            ) : null}
            <VendorPaymentDetail
              canApprove={canApprove}
              isOwner={isOwner}
              request={vendorPayment}
            />
          </>
        )}
      </div>
    </div>
  );
}
