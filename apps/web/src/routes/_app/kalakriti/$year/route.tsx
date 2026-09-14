import { createFileRoute, notFound, Outlet } from "@tanstack/react-router";

import { getCoordinatedKalakritiEditionAccess } from "@/lib/kalakriti-access-request";

export const Route = createFileRoute("/_app/kalakriti/$year")({
  beforeLoad: async ({ context, params }) => {
    const year = Number(params.year);
    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
      throw notFound();
    }
    const access = await getCoordinatedKalakritiEditionAccess(
      context.session,
      year
    );
    if (!access) {
      throw notFound();
    }
    return { kalakritiEditionAccess: access };
  },
  component: KalakritiEditionLayout,
});

function KalakritiEditionLayout() {
  return (
    <div className="app-container mx-auto w-full max-w-7xl px-2 py-6 sm:px-4">
      <Outlet />
    </div>
  );
}
