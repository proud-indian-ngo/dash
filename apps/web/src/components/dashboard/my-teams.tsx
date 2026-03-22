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
  id: string;
  name: string;
  description: string | null;
  members: readonly { id: string }[];
}

export function MyTeams({
  teams,
  isLoading,
}: {
  teams: readonly Team[];
  isLoading?: boolean;
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
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div className="flex items-center justify-between" key={i}>
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        ) : teams.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            You haven't joined any teams yet.
          </p>
        ) : (
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
        )}
      </CardContent>
    </Card>
  );
}
