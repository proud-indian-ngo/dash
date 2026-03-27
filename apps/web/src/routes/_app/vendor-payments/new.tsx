import { env } from "@pi-dash/env/web";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { VendorPaymentForm } from "@/components/vendor-payments/vendor-payment-form";
import { assertPermission } from "@/lib/route-guards";

export const Route = createFileRoute("/_app/vendor-payments/new")({
  beforeLoad: ({ context }) => assertPermission(context, "requests.create"),
  head: () => ({
    meta: [{ title: `New Vendor Payment | ${env.VITE_APP_NAME}` }],
  }),
  component: NewVendorPaymentRouteComponent,
});

function NewVendorPaymentRouteComponent() {
  const navigate = useNavigate();

  return (
    <div className="app-container mx-auto max-w-3xl px-4 py-6">
      <h1 className="font-display font-semibold text-2xl tracking-tight">
        New Vendor Payment
      </h1>
      <p className="mt-2 text-muted-foreground text-sm">
        Fill in the details and add line items for your vendor payment.
      </p>
      <div className="mt-6">
        <VendorPaymentForm
          onCancel={() => {
            navigate({ to: "/vendor-payments" });
          }}
          onSaved={(id) => {
            navigate({ to: "/vendor-payments/$id", params: { id } });
          }}
        />
      </div>
    </div>
  );
}
