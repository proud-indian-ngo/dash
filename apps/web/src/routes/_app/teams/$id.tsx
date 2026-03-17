import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { TeamDetail } from "@/components/teams/team-detail";
import { useApp } from "@/context/app-context";
import { useZeroQueryStatus } from "@/hooks/use-zero-query";

export const Route = createFileRoute("/_app/teams/$id")({
  head: () => ({
    meta: [{ title: `Team Details | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context, params }) => {
    context.zero?.run(queries.team.byId({ id: params.id }));
    context.zero?.run(queries.teamEvent.byTeam({ teamId: params.id }));
  },
  component: TeamDetailRouteComponent,
});

function TeamDetailRouteComponent() {
  const { id } = Route.useParams();
  const { session } = Route.useRouteContext();
  const { isAdmin } = useApp();

  const [team, result] = useQuery(queries.team.byId({ id }));
  const isLoading = useZeroQueryStatus(result);

  if (isLoading) {
    return (
      <div className="app-container mx-auto max-w-7xl px-4 py-6">
        <p className="text-muted-foreground text-sm">Loading...</p>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="app-container mx-auto max-w-7xl px-4 py-6">
        <p className="text-muted-foreground text-sm">Team not found.</p>
      </div>
    );
  }

  return (
    <div className="app-container mx-auto max-w-7xl px-4 py-6">
      <TeamDetail isAdmin={isAdmin} team={team} userId={session.user.id} />
    </div>
  );
}
