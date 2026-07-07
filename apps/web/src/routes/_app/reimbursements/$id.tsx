import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Loader } from "@/components/loader";
import { ReimbursementDetail } from "@/components/reimbursements/reimbursement-detail";
import { ReimbursementForm } from "@/components/reimbursements/reimbursement-form";
import { useApp } from "@/context/app-context";
import type { RequestDetailData, RequestType } from "@/lib/reimbursement-types";
import { REQUEST_TYPE_LABELS } from "@/lib/reimbursement-types";
import { canEditRequestSubmission } from "@/lib/request-edit-permissions";
import {
  mapAttachmentsToFormValues,
  mapLineItemsToFormValues,
} from "@/lib/submission-mappers";

export const Route = createFileRoute("/_app/reimbursements/$id")({
  validateSearch: z.object({
    mode: z.enum(["edit"]).optional(),
  }),
  head: () => ({
    meta: [{ title: `Reimbursement Details | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context, params }) => {
    context.zero?.preload(queries.reimbursement.byId({ id: params.id }));
    context.zero?.preload(queries.advancePayment.byId({ id: params.id }));
  },
  component: ReimbursementDetailRouteComponent,
});

interface ResolvedRequest {
  data: RequestDetailData;
  expenseDate: Date | undefined;
  type: RequestType;
}

function useResolvedRequest(id: string): {
  isLoading: boolean;
  resolved: ResolvedRequest | null;
} {
  const [reimbursement, r1] = useQuery(queries.reimbursement.byId({ id }));
  const [advancePayment, r2] = useQuery(queries.advancePayment.byId({ id }));
  const allNotComplete = r1.type !== "complete" && r2.type !== "complete";

  if (!(reimbursement || advancePayment) && allNotComplete) {
    return { isLoading: true, resolved: null };
  }

  if (reimbursement) {
    return {
      isLoading: false,
      resolved: {
        data: { ...reimbursement, type: "reimbursement" } as RequestDetailData,
        type: "reimbursement",
        expenseDate: new Date(reimbursement.expenseDate),
      },
    };
  }

  if (advancePayment) {
    return {
      isLoading: false,
      resolved: {
        data: {
          ...advancePayment,
          type: "advance_payment",
        } as RequestDetailData,
        type: "advance_payment",
        expenseDate: undefined,
      },
    };
  }

  return { isLoading: false, resolved: null };
}

function ReimbursementDetailRouteComponent() {
  const { id } = Route.useParams();
  const { isLoading, resolved } = useResolvedRequest(id);

  if (isLoading) {
    return (
      <div className="app-container mx-auto max-w-3xl px-2 py-6 sm:px-4">
        <Loader />
      </div>
    );
  }

  if (!resolved) {
    return (
      <div className="app-container mx-auto max-w-3xl px-2 py-6 sm:px-4">
        <p className="text-muted-foreground text-sm">
          Reimbursement not found.
        </p>
      </div>
    );
  }

  return <ResolvedRequestView resolved={resolved} />;
}

function buildInitialValues(resolved: ResolvedRequest) {
  const { data: request, type: requestType, expenseDate } = resolved;

  return {
    id: request.id,
    type: requestType,
    title: request.title,
    ...("city" in request ? { city: request.city ?? undefined } : {}),
    ...("bankAccountName" in request
      ? {
          bankAccountName: request.bankAccountName ?? undefined,
          bankAccountNumber: request.bankAccountNumber ?? undefined,
          bankAccountIfscCode: request.bankAccountIfscCode ?? undefined,
        }
      : {}),
    ...("eventId" in request ? { eventId: request.eventId ?? undefined } : {}),
    lineItems: mapLineItemsToFormValues(request.lineItems),
    attachments: mapAttachmentsToFormValues(request.attachments),
    ...(expenseDate ? { expenseDate } : {}),
  };
}

function ResolvedRequestView({ resolved }: { resolved: ResolvedRequest }) {
  const { session } = Route.useRouteContext();
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const { hasPermission } = useApp();

  const { data: request, type: requestType } = resolved;

  const canEditAll = hasPermission("requests.edit_all");
  const canEditAnyStatus = hasPermission("requests.edit_all_statuses");
  const canApprove = hasPermission("requests.approve");
  const canEdit = canEditRequestSubmission(
    request,
    session.user.id,
    hasPermission
  );
  const isAdminEditingAnotherUser =
    (canEditAll || canEditAnyStatus) && request.userId !== session.user.id;
  const showEditForm = canEdit && mode === "edit";

  const typeLabel = REQUEST_TYPE_LABELS[requestType];
  const setEditMode = (enabled: boolean) => {
    navigate({
      to: "/reimbursements/$id",
      params: { id: request.id },
      search: enabled ? { mode: "edit" } : {},
      replace: true,
    });
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
                Edit {typeLabel}
              </h1>
              <Button
                onClick={() => setEditMode(false)}
                type="button"
                variant="outline"
              >
                View details
              </Button>
            </div>
            <p className="mt-2 text-muted-foreground text-sm">
              Update submission details.
            </p>
            <div className="mt-6">
              <ReimbursementForm
                disableBankAccountSelection={isAdminEditingAnotherUser}
                initialValues={buildInitialValues(resolved)}
                onCancel={() => {
                  navigate({ to: "/reimbursements" });
                }}
                onSaved={() => {
                  setEditMode(false);
                }}
                requestType={requestType}
              />
            </div>
          </>
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
            <ReimbursementDetail
              canApprove={canApprove}
              canUpdateAnyStatus={canEditAnyStatus}
              request={request}
            />
          </>
        )}
      </div>
    </div>
  );
}
