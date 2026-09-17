import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_app/kalakriti/$year/competitions/categories"
)({
  beforeLoad: ({ params }) => {
    throw redirect({
      params: { year: params.year },
      replace: true,
      search: (previous) => previous,
      to: "/kalakriti/$year/settings/categories",
    });
  },
});
