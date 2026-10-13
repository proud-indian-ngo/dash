import { Button } from "@pi-dash/design-system/components/ui/button";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import * as z from "zod";

import { ReimbursementDetail } from "@/components/reimbursements/reimbursement-detail";
import { ReimbursementForm } from "@/components/reimbursements/reimbursement-form";
import { RecordNotFound } from "@/components/shared/not-found-state";
import { PageHeader } from "@/components/shared/page-header";
import { DetailPageSkeleton } from "@/components/shared/page-skeleton";
import { useApp } from "@/context/app-context";
import { useRecordTitle } from "@/hooks/use-record-title";
import type { RequestDetailData, RequestType } from "@/lib/reimbursement-types";
import { REQUEST_TYPE_LABELS } from "@/lib/reimbursement-types";
import { canEditRequestSubmission } from "@/lib/request-edit-permissions";
import { preloadRouteQuery } from "@/lib/route-preload";
import {
  mapAttachmentsToFormValues,
  mapLineItemsToFormValues,
} from "@/lib/submission-mappers";

export const Route = createFileRoute("/_app/reimbursements/$id")({
  component: ReimbursementDetailRouteComponent,
  head: () => ({
    meta: [{ title: `Reimbursement Details | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ abortController, context, params }) => {
    preloadRouteQuery(
      context.zero,
      queries.reimbursement.byId({ id: params.id }),
      abortController.signal
    );
    preloadRouteQuery(
      context.zero,
      queries.advancePayment.byId({ id: params.id }),
      abortController.signal
    );
  },
  validateSearch: z.object({
    mode: z.enum(["edit"]).optional(),
  }),
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
  const anyNotComplete = r1.type !== "complete" || r2.type !== "complete";

  if (!(reimbursement || advancePayment) && anyNotComplete) {
    return { isLoading: true, resolved: null };
  }

  if (reimbursement) {
    return {
      isLoading: false,
      resolved: {
        data: { ...reimbursement, type: "reimbursement" } as RequestDetailData,
        expenseDate: new Date(reimbursement.expenseDate),
        type: "reimbursement",
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
        expenseDate: undefined,
        type: "advance_payment",
      },
    };
  }

  return { isLoading: false, resolved: null };
}

function ReimbursementDetailRouteComponent() {
  const { id } = Route.useParams();
  const { isLoading, resolved } = useResolvedRequest(id);
  useRecordTitle(resolved?.data.title);

  if (isLoading) {
    return (
      <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
        <DetailPageSkeleton />
      </div>
    );
  }

  if (!resolved) {
    return (
      <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
        <RecordNotFound
          backLabel="Back to reimbursements"
          backTo="/reimbursements"
          noun="Reimbursement"
        />
      </div>
    );
  }

  return <ResolvedRequestView resolved={resolved} />;
}

function buildInitialValues(resolved: ResolvedRequest) {
  const { data: request, type: requestType, expenseDate } = resolved;

  return {
    id: request.id,
    title: request.title,
    type: requestType,
    ...("city" in request ? { city: request.city ?? undefined } : {}),
    ...("bankAccountName" in request
      ? {
          bankAccountIfscCode: request.bankAccountIfscCode ?? undefined,
          bankAccountName: request.bankAccountName ?? undefined,
          bankAccountNumber: request.bankAccountNumber ?? undefined,
        }
      : {}),
    ...("eventId" in request ? { eventId: request.eventId ?? undefined } : {}),
    ...("programmeId" in request ? { programmeId: request.programmeId } : {}),
    attachments: mapAttachmentsToFormValues(request.attachments),
    lineItems: mapLineItemsToFormValues(request.lineItems),
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
      params: { id: request.id },
      replace: true,
      search: enabled ? { mode: "edit" } : {},
      to: "/reimbursements/$id",
    });
  };
  const stableOnClick0 = useEventCallback(() => setEditMode(false));
  const stableOnCancel1 = useEventCallback(() => {
    navigate({ to: "/reimbursements" });
  });
  const stableOnSaved2 = useEventCallback(() => {
    setEditMode(false);
  });
  const stableOnClick3 = useEventCallback(() => setEditMode(true));

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <div
        className="fade-in-0 animate-in duration-150 ease-(--ease-out-expo)"
        key={showEditForm ? "edit" : "view"}
      >
        {showEditForm ? (
          <>
            <PageHeader
              actions={
                <Button
                  onClick={stableOnClick0}
                  type="button"
                  variant="outline"
                >
                  View details
                </Button>
              }
              description="Update submission details."
              title={`Edit ${typeLabel}`}
            />
            <div className="mt-6">
              <ReimbursementForm
                disableBankAccountSelection={isAdminEditingAnotherUser}
                initialValues={buildInitialValues(resolved)}
                onCancel={stableOnCancel1}
                onSaved={stableOnSaved2}
                requestType={requestType}
              />
            </div>
          </>
        ) : (
          <ReimbursementDetail
            canApprove={canApprove}
            canUpdateAnyStatus={canEditAnyStatus}
            onEdit={canEdit ? stableOnClick3 : undefined}
            request={request}
          />
        )}
      </div>
    </div>
  );
}
