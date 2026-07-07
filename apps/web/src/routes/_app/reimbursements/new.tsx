import { env } from "@pi-dash/env/web";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ReimbursementForm } from "@/components/reimbursements/reimbursement-form";

export const Route = createFileRoute("/_app/reimbursements/new")({
  component: NewReimbursementRouteComponent,
  head: () => ({
    meta: [{ title: `New Reimbursement | ${env.VITE_APP_NAME}` }],
  }),
});

function NewReimbursementRouteComponent() {
  const navigate = useNavigate();
  const stableOnCancel0 = () => {
    navigate({ to: "/reimbursements" });
  };
  const stableOnSaved1 = (id: any) => {
    navigate({ params: { id }, to: "/reimbursements/$id" });
  };

  return (
    <div className="app-container mx-auto max-w-3xl px-2 py-6 sm:px-4">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        New Reimbursement
      </h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Fill in the details and add line items for your reimbursement.
      </p>
      <div className="mt-6">
        <ReimbursementForm
          onCancel={stableOnCancel0}
          onSaved={stableOnSaved1}
          requestType="reimbursement"
        />
      </div>
    </div>
  );
}
