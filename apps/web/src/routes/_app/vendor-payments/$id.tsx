import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Loader } from "@/components/loader";
import { VendorPaymentDetail } from "@/components/vendor-payments/vendor-payment-detail";
import { VendorPaymentForm } from "@/components/vendor-payments/vendor-payment-form";
import { useApp } from "@/context/app-context";
import { canEditVendorPaymentSubmission } from "@/lib/request-edit-permissions";
import {
  mapAttachmentsToFormValues,
  mapLineItemsToFormValues,
} from "@/lib/submission-mappers";

export const Route = createFileRoute("/_app/vendor-payments/$id")({
  validateSearch: z.object({
    mode: z.enum(["edit"]).optional(),
  }),
  head: () => ({
    meta: [{ title: `Vendor Payment Details | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context, params }) => {
    context.zero?.preload(queries.vendorPayment.byId({ id: params.id }));
  },
  component: VendorPaymentDetailRouteComponent,
});

function VendorPaymentEditPane({
  initialValues,
  onCancel,
  onSaved,
  onViewDetails,
}: {
  initialValues: React.ComponentProps<
    typeof VendorPaymentForm
  >["initialValues"];
  onCancel: () => void;
  onSaved: () => void;
  onViewDetails: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display font-semibold text-2xl tracking-tight">
          Edit Vendor Payment
        </h1>
        <Button onClick={onViewDetails} type="button" variant="outline">
          View details
        </Button>
      </div>
      <p className="mt-2 text-muted-foreground text-sm">
        Update submission details.
      </p>
      <div className="mt-6">
        <VendorPaymentForm
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

  const canEditAnyStatus = hasPermission("requests.edit_all_statuses");
  const canApprove = hasPermission("requests.approve");
  const isOwner = vendorPayment.userId === session.user.id;
  const canEdit = canEditVendorPaymentSubmission(
    vendorPayment,
    session.user.id,
    hasPermission
  );
  const showEditForm = canEdit && mode === "edit";
  const setEditMode = (enabled: boolean) => {
    navigate({
      to: "/vendor-payments/$id",
      params: { id: vendorPayment.id as string },
      search: enabled ? { mode: "edit" } : {},
      replace: true,
    });
  };

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
          <VendorPaymentEditPane
            initialValues={initialValues}
            onCancel={() => {
              navigate({ to: "/vendor-payments" });
            }}
            onSaved={() => {
              setEditMode(false);
            }}
            onViewDetails={() => setEditMode(false)}
          />
        ) : (
          <>
            {canEdit ? (
              <div className="mb-4 flex justify-end">
                <Button
                  onClick={() => setEditMode(true)}
                  type="button"
                  variant="outline"
                >
                  Edit submission
                </Button>
              </div>
            ) : null}
            <VendorPaymentDetail
              canApprove={canApprove}
              canUpdateAnyStatus={canEditAnyStatus}
              isOwner={isOwner}
              request={vendorPayment}
            />
          </>
        )}
      </div>
    </div>
  );
}
