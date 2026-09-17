import { createFileRoute, notFound, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/kalakriti/$year/eligibility")({
  beforeLoad: ({ context, params }) => {
    const access = context.kalakritiEditionAccess;
    if (
      !access.isGlobalAdmin &&
      !access.membership?.responsibilities.includes("edition_admin")
    ) {
      throw notFound();
    }
    throw redirect({
      params: { year: params.year },
      replace: true,
      search: (previous) => previous,
      to: "/kalakriti/$year/settings/eligibility",
    });
  },
});
