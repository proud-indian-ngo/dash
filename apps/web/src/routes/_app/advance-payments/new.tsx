import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AdvancePaymentForm } from "@/components/advance-payments/advance-payment-form";

export const Route = createFileRoute("/_app/advance-payments/new")({
  head: () => ({
    meta: [{ title: "New Advance Payment | Proud Indian Dashboard" }],
  }),
  component: NewAdvancePaymentRouteComponent,
});

function NewAdvancePaymentRouteComponent() {
  const navigate = useNavigate();

  return (
    <div className="app-container mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-semibold text-2xl">New Advance Payment</h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Fill in the details and add line items for your advance payment request.
      </p>
      <div className="mt-6">
        <AdvancePaymentForm
          onCancel={() => {
            navigate({ to: "/advance-payments" });
          }}
          onSaved={(id) => {
            navigate({ to: "/advance-payments/$id", params: { id } });
          }}
        />
      </div>
    </div>
  );
}
