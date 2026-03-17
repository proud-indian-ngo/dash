import { env } from "@pi-dash/env/web";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ReimbursementForm } from "@/components/reimbursements/reimbursement-form";

export const Route = createFileRoute("/_app/reimbursements/new")({
  head: () => ({
    meta: [{ title: `New Reimbursement | ${env.VITE_APP_NAME}` }],
  }),
  component: NewReimbursementRouteComponent,
});

function NewReimbursementRouteComponent() {
  const navigate = useNavigate();

  return (
    <div className="app-container mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-semibold text-2xl">New Reimbursement</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Fill in the details and add line items for your expense request.
      </p>
      <div className="mt-6">
        <ReimbursementForm
          onCancel={() => {
            navigate({ to: "/reimbursements" });
          }}
          onSaved={(id) => {
            navigate({ to: "/reimbursements/$id", params: { id } });
          }}
        />
      </div>
    </div>
  );
}
