import { BrailleSpinner } from "@pi-dash/design-system/components/braille-spinner";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AdvancePaymentDetail } from "@/components/advance-payments/advance-payment-detail";
import { AdvancePaymentForm } from "@/components/advance-payments/advance-payment-form";
import { useApp } from "@/context/app-context";
import { useZeroQueryStatus } from "@/hooks/use-zero-query";
import {
  mapAttachmentsToFormValues,
  mapLineItemsToFormValues,
} from "@/lib/submission-mappers";

export const Route = createFileRoute("/_app/advance-payments/$id")({
  head: () => ({
    meta: [{ title: `Advance Payment Details | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context, params }) => {
    context.zero?.run(queries.advancePayment.byId({ id: params.id }));
  },
  component: AdvancePaymentDetailRouteComponent,
});

function AdvancePaymentDetailRouteComponent() {
  const { id } = Route.useParams();
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  const [adminEditMode, setAdminEditMode] = useState(false);

  const [advancePayment, result] = useQuery(
    queries.advancePayment.byId({ id })
  );
  const isLoading = useZeroQueryStatus(result);
  const { isAdmin } = useApp();

  if (isLoading) {
    return (
      <div className="app-container mx-auto max-w-3xl px-4 py-6">
        <BrailleSpinner />
      </div>
    );
  }

  if (!advancePayment) {
    return (
      <div className="app-container mx-auto max-w-3xl px-4 py-6">
        <p className="text-muted-foreground text-sm">
          Advance payment not found.
        </p>
      </div>
    );
  }

  const isPending = advancePayment.status === "pending";
  const isOwner = advancePayment.userId === session.user.id;
  const canEdit = isPending && (isOwner || isAdmin);
  const showAdminActions = isAdmin && isPending;
  const isAdminEditingAnotherUser =
    isAdmin && advancePayment.userId !== session.user.id;
  const showEditForm = canEdit && (!showAdminActions || adminEditMode);

  return (
    <div className="app-container mx-auto max-w-3xl px-4 py-6">
      {showEditForm ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-semibold text-2xl">Edit Advance Payment</h1>
            {showAdminActions ? (
              <Button
                onClick={() => setAdminEditMode(false)}
                type="button"
                variant="secondary"
              >
                View details
              </Button>
            ) : null}
          </div>
          <p className="mt-2 text-muted-foreground text-sm">
            Update your submission before it is reviewed.
          </p>
          <div className="mt-6">
            <AdvancePaymentForm
              disableBankAccountSelection={isAdminEditingAnotherUser}
              initialValues={{
                id: advancePayment.id,
                title: advancePayment.title,
                city: advancePayment.city ?? undefined,
                bankAccountName: advancePayment.bankAccountName ?? undefined,
                bankAccountNumber:
                  advancePayment.bankAccountNumber ?? undefined,
                bankAccountIfscCode:
                  advancePayment.bankAccountIfscCode ?? undefined,
                lineItems: mapLineItemsToFormValues(advancePayment.lineItems),
                attachments: mapAttachmentsToFormValues(
                  advancePayment.attachments
                ),
              }}
              onCancel={() => {
                navigate({ to: "/advance-payments" });
              }}
              onSaved={() => {
                setAdminEditMode(false);
              }}
            />
          </div>
        </>
      ) : (
        <>
          {showAdminActions ? (
            <div className="mb-4 flex justify-end">
              <Button
                onClick={() => setAdminEditMode(true)}
                type="button"
                variant="secondary"
              >
                Edit submission
              </Button>
            </div>
          ) : null}
          <AdvancePaymentDetail
            advancePayment={advancePayment}
            isAdmin={isAdmin}
          />
        </>
      )}
    </div>
  );
}
