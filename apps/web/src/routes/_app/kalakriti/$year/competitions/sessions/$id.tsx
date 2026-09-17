import { createFileRoute, redirect } from "@tanstack/react-router";
import z from "zod";

export const Route = createFileRoute(
  "/_app/kalakriti/$year/competitions/sessions/$id"
)({
  validateSearch: z.object({ center: z.string().optional() }),
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/kalakriti/$year/competitions",
      params: { year: params.year },
      search: { competition: params.id, center: search.center },
      replace: true,
    });
  },
});
