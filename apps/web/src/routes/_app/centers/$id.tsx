import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { CenterDetail } from "@/components/centers/center-detail";
import { Loader } from "@/components/loader";

export const Route = createFileRoute("/_app/centers/$id")({
  head: () => ({
    meta: [{ title: `Center Details | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context, params }) => {
    context.zero?.preload(queries.center.byId({ id: params.id }));
  },
  component: CenterDetailRouteComponent,
});

function CenterDetailRouteComponent() {
  const { id } = Route.useParams();
  const [center, result] = useQuery(queries.center.byId({ id }));

  if (!center && result.type !== "complete") {
    return (
      <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
        <Loader />
      </div>
    );
  }

  if (!center) {
    return (
      <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
        <p className="text-muted-foreground text-sm">Center not found.</p>
      </div>
    );
  }

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <CenterDetail center={center} />
    </div>
  );
}
