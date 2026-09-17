import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/kalakriti/$year/settings/")({
  beforeLoad: ({ context, params }) => {
    const access = context.kalakritiEditionAccess;
    const canManageEdition =
      access.isGlobalAdmin ||
      access.membership?.responsibilities.includes("edition_admin") === true;
    throw redirect({
      params: { year: params.year },
      replace: true,
      to: canManageEdition
        ? "/kalakriti/$year/settings/edition"
        : "/kalakriti/$year/settings/categories",
    });
  },
});
