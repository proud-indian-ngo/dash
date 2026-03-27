import { env } from "@pi-dash/env/web";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RequestForm } from "@/components/requests/request-form";

export const Route = createFileRoute("/_app/requests/new")({
  head: () => ({
    meta: [{ title: `New Request | ${env.VITE_APP_NAME}` }],
  }),
  component: NewRequestRouteComponent,
});

function NewRequestRouteComponent() {
  const navigate = useNavigate();

  return (
    <div className="app-container mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        New Request
      </h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Fill in the details and add line items for your request.
      </p>
      <div className="mt-6">
        <RequestForm
          onCancel={() => {
            navigate({ to: "/requests" });
          }}
          onSaved={(id) => {
            navigate({ to: "/requests/$id", params: { id } });
          }}
          requestType="reimbursement"
        />
      </div>
    </div>
  );
}
