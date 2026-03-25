import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Loader } from "@/components/loader";
import { RequestDetail } from "@/components/requests/request-detail";
import { RequestForm } from "@/components/requests/request-form";
import { useApp } from "@/context/app-context";
import { useZeroQueryStatus } from "@/hooks/use-zero-query";
import type { RequestDetailData, RequestType } from "@/lib/request-types";
import { isVendorPayment, REQUEST_TYPE_LABELS } from "@/lib/request-types";
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
    context.zero?.run(queries.vendorPayment.byId({ id: params.id }));
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
  const [vendorPayment, r3] = useQuery(queries.vendorPayment.byId({ id }));
  const isLoading1 = useZeroQueryStatus(r1);
  const isLoading2 = useZeroQueryStatus(r2);
  const isLoading3 = useZeroQueryStatus(r3);

  if (isLoading1 || isLoading2 || isLoading3) {
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

  if (vendorPayment) {
    return {
      isLoading: false,
      resolved: {
        data: {
          ...vendorPayment,
          type: "vendor_payment",
        } as RequestDetailData,
        type: "vendor_payment",
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
        <Loader />
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

function buildInitialValues(resolved: ResolvedRequest) {
  const { data: request, type: requestType, expenseDate } = resolved;

  const vendorInitialValues = isVendorPayment(request)
    ? {
        vendorId: request.vendorId,
        invoiceNumber: request.invoiceNumber ?? "",
        invoiceDate: request.invoiceDate,
      }
    : {};

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
    lineItems: mapLineItemsToFormValues(request.lineItems),
    attachments: mapAttachmentsToFormValues(request.attachments),
    ...(expenseDate ? { expenseDate } : {}),
    ...vendorInitialValues,
  };
}

function ResolvedRequestView({ resolved }: { resolved: ResolvedRequest }) {
  const { session } = Route.useRouteContext();
  const navigate = useNavigate();
  const [adminEditMode, setAdminEditMode] = useState(false);
  const { hasPermission } = useApp();

  const { data: request, type: requestType } = resolved;

  const canEditAll = hasPermission("requests.edit_all");
  const canApprove = hasPermission("requests.approve");
  const isPending = request.status === "pending";
  const isOwner = request.userId === session.user.id;
  const canEdit = isPending && (isOwner || canEditAll);
  const showAdminActions = canApprove && isPending;
  const isAdminEditingAnotherUser =
    canEditAll && request.userId !== session.user.id;
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
          <RequestForm
            disableBankAccountSelection={isAdminEditingAnotherUser}
            disableTypeSelection
            initialValues={buildInitialValues(resolved)}
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
            variant="outline"
          >
            Edit submission
          </Button>
        </div>
      ) : null}
      <RequestDetail canApprove={canApprove} request={request} />
    </div>
  );
}
