import { queries } from "@pi-dash/zero/queries";
import { schema } from "@pi-dash/zero/schema";
import { mustGetQuery } from "@rocicorp/zero";
import { handleQueryRequest } from "@rocicorp/zero/server";
import { createFileRoute } from "@tanstack/react-router";
import { buildSessionContext, requireSession } from "@/lib/api-auth";

export const Route = createFileRoute("/api/zero/query")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { session, error } = await requireSession(request);
        if (error) {
          return error;
        }

        const ctx = buildSessionContext(session);

        return Response.json(
          await handleQueryRequest(
            (name, args) => {
              const query = mustGetQuery(queries, name);
              return query.fn({ args, ctx });
            },
            schema,
            request
          )
        );
      },
    },
  },
});
