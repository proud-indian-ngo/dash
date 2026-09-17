import { createFileRoute, redirect } from "@tanstack/react-router";
import z from "zod";
export const Route = createFileRoute("/_app/kalakriti/$year/entries/$id")({
  validateSearch: z.object({ center: z.string().optional() }),
  beforeLoad: ({ params, search }) => {
    throw redirect({
      to: "/kalakriti/$year/competitions",
      params: { year: params.year },
      search: { ...search, competition: params.id },
      replace: true,
    });
  },
});
