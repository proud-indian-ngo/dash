import { BrailleSpinner } from "@pi-dash/design-system/components/braille-spinner";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { RequestDetail } from "@/components/requests/request-detail";
import { RequestForm } from "@/components/requests/request-form";
import { useApp } from "@/context/app-context";
import { useZeroQueryStatus } from "@/hooks/use-zero-query";
import type { RequestDetailData, RequestType } from "@/lib/request-types";
import { REQUEST_TYPE_LABELS } from "@/lib/request-types";
import {
  mapAttachmentsToFormValues,
  mapLineItemsToFormValues,
} from "@/lib/submission-mappers";

export const Route = createFileRoute("/_app/requests/$id")({
  head: () => ({
    meta: [{ title: `Request Details | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context, params }) => {
    context.zero?.run(queries.reimbursement.byId({ id: params.id }));
    context.zero?.run(queries.advancePayment.byId({ id: params.id }));
  },
  component: RequestDetailRouteComponent,
});

interface ResolvedRequest {
  data: RequestDetailData;
  expenseDate: string | undefined;
  type: RequestType;
}

function useResolvedRequest(id: string): {
  isLoading: boolean;
  resolved: ResolvedRequest | null;
} {
  const [reimbursement, r1] = useQuery(queries.reimbursement.byId({ id }));
  const [advancePayment, r2] = useQuery(queries.advancePayment.byId({ id }));
  const isLoading1 = useZeroQueryStatus(r1);
  const isLoading2 = useZeroQueryStatus(r2);

  if (isLoading1 || isLoading2) {
    return { isLoading: true, resolved: null };
  }

  if (reimbursement) {
    return {
      isLoading: false,
      resolved: {
        data: { ...reimbursement, type: "reimbursement" } as RequestDetailData,
        type: "reimbursement",
        expenseDate: reimbursement.expenseDate,
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

function RequestDetailRouteComponent() {
  const { id } = Route.useParams();
  const { isLoading, resolved } = useResolvedRequest(id);

  if (isLoading) {
    return (
      <div className="app-container mx-auto max-w-3xl px-4 py-6">
        <BrailleSpinner />
      </div>
    );
  }

  if (!resolved) {
    return (
      <div className="app-container mx-auto max-w-3xl px-4 py-6">
        <p className="text-muted-foreground text-sm">Request not found.</p>
      </div>
    );
  }

  return <ResolvedRequestView resolved={resolved} />;
}

function ResolvedRequestView({ resolved }: { resolved: ResolvedRequest }) {
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  const [adminEditMode, setAdminEditMode] = useState(false);
  const { isAdmin } = useApp();

  const { data: request, type: requestType, expenseDate } = resolved;

  const isPending = request.status === "pending";
  const isOwner = request.userId === session.user.id;
  const canEdit = isPending && (isOwner || isAdmin);
  const showAdminActions = isAdmin && isPending;
  const isAdminEditingAnotherUser =
    isAdmin && request.userId !== session.user.id;
  const showEditForm = canEdit && (!showAdminActions || adminEditMode);

  const typeLabel = REQUEST_TYPE_LABELS[requestType];

  if (showEditForm) {
    return (
      <div className="app-container mx-auto max-w-3xl px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-semibold text-2xl">Edit {typeLabel}</h1>
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
          <RequestForm
            disableBankAccountSelection={isAdminEditingAnotherUser}
            disableTypeSelection
            initialValues={{
              id: request.id,
              type: requestType,
              title: request.title,
              city: request.city ?? undefined,
              bankAccountName: request.bankAccountName ?? undefined,
              bankAccountNumber: request.bankAccountNumber ?? undefined,
              bankAccountIfscCode: request.bankAccountIfscCode ?? undefined,
              lineItems: mapLineItemsToFormValues(request.lineItems),
              attachments: mapAttachmentsToFormValues(request.attachments),
              ...(expenseDate ? { expenseDate } : {}),
            }}
            onCancel={() => {
              navigate({ to: "/requests" });
            }}
            onSaved={() => {
              setAdminEditMode(false);
            }}
            requestType={requestType}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="app-container mx-auto max-w-3xl px-4 py-6">
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
      <RequestDetail isAdmin={isAdmin} request={request} />
    </div>
  );
}
