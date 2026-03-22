import { UserMultipleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import { Link } from "@tanstack/react-router";

interface Team {
  description: string | null;
  id: string;
  members: readonly { id: string }[];
  name: string;
}

function MyTeamsSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div className="flex items-center justify-between" key={i}>
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

function MyTeamsEmpty() {
  return (
    <p className="text-muted-foreground text-sm">
      You haven't joined any teams yet.
    </p>
  );
}

function MyTeamsList({ teams }: { teams: readonly Team[] }) {
  return (
    <div className="space-y-3">
      {teams.map((team) => (
        <Link
          className="flex items-center justify-between rounded-md p-2 transition-colors hover:bg-muted/50"
          key={team.id}
          params={{ id: team.id }}
          to="/teams/$id"
        >
          <div className="min-w-0">
            <p className="truncate font-medium text-sm">{team.name}</p>
            {team.description && (
              <p className="truncate text-muted-foreground text-xs">
                {team.description}
              </p>
            )}
          </div>
          <span className="ml-2 shrink-0 text-muted-foreground text-xs">
            {team.members.length}{" "}
            {team.members.length === 1 ? "member" : "members"}
          </span>
        </Link>
      ))}
    </div>
  );
}

function MyTeamsContent({
  isLoading,
  teams,
}: {
  isLoading?: boolean;
  teams: readonly Team[];
}) {
  if (isLoading) {
    return <MyTeamsSkeleton />;
  }
  if (teams.length === 0) {
    return <MyTeamsEmpty />;
  }
  return <MyTeamsList teams={teams} />;
}

export function MyTeams({
  isLoading,
  teams,
}: {
  isLoading?: boolean;
  teams: readonly Team[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5 text-sm">
          <HugeiconsIcon
            className="size-4"
            icon={UserMultipleIcon}
            strokeWidth={2}
          />
          My Teams
        </CardTitle>
      </CardHeader>
      <CardContent>
        <MyTeamsContent isLoading={isLoading} teams={teams} />
      </CardContent>
    </Card>
  );
}
