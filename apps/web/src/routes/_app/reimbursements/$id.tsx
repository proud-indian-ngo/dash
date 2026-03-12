import { Button } from "@pi-dash/design-system/components/ui/button";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ReimbursementDetail } from "@/components/reimbursements/reimbursement-detail";
import { ReimbursementForm } from "@/components/reimbursements/reimbursement-form.tsx";
import {
  mapAttachmentsToFormValues,
  mapLineItemsToFormValues,
} from "@/lib/submission-mappers";

export const Route = createFileRoute("/_app/reimbursements/$id")({
  head: () => ({
    meta: [{ title: "Reimbursement Details | Proud Indian Dashboard" }],
  }),
  loader: ({ context, params }) => {
    context.zero?.run(queries.reimbursement.byId({ id: params.id }));
  },
  component: ReimbursementDetailRouteComponent,
});

function ReimbursementDetailRouteComponent() {
  const { id } = Route.useParams();
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  const [adminEditMode, setAdminEditMode] = useState(false);

  const [reimbursement, result] = useQuery(queries.reimbursement.byId({ id }));
  const isAdmin = session.user.role === "admin";
  const isLoading = result.type === "unknown";

  if (isLoading) {
    return (
      <div className="app-container mx-auto max-w-3xl px-4 py-6">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  if (!reimbursement) {
    return (
      <div className="app-container mx-auto max-w-3xl px-4 py-6">
        <p className="text-muted-foreground text-sm">
          Reimbursement not found.
        </p>
      </div>
    );
  }

  const isPending = reimbursement.status === "pending";
  const isOwner = reimbursement.userId === session.user.id;
  const canEdit = isPending && (isOwner || isAdmin);
  const showAdminActions = isAdmin && isPending;
  const isAdminEditingAnotherUser =
    isAdmin && reimbursement.userId !== session.user.id;
  const showEditForm = canEdit && (!showAdminActions || adminEditMode);

  return (
    <div className="app-container mx-auto max-w-3xl px-4 py-6">
      {showEditForm ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-semibold text-2xl">Edit Submission</h1>
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
            <ReimbursementForm
              disableBankAccountSelection={isAdminEditingAnotherUser}
              initialValues={{
                id: reimbursement.id,
                title: reimbursement.title,
                city: reimbursement.city ?? undefined,
                expenseDate: reimbursement.expenseDate,
                bankAccountName: reimbursement.bankAccountName ?? undefined,
                bankAccountNumber: reimbursement.bankAccountNumber ?? undefined,
                bankAccountIfscCode:
                  reimbursement.bankAccountIfscCode ?? undefined,
                lineItems: mapLineItemsToFormValues(reimbursement.lineItems),
                attachments: mapAttachmentsToFormValues(
                  reimbursement.attachments
                ),
              }}
              onCancel={() => {
                navigate({ to: "/reimbursements" });
              }}
              onSaved={() => {
                navigate({ to: "/reimbursements" });
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
          <ReimbursementDetail
            isAdmin={isAdmin}
            reimbursement={reimbursement}
          />
        </>
      )}
    </div>
  );
}
