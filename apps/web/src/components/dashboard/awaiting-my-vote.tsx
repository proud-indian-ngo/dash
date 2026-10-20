import {
  ArrowRight01Icon,
  LegalDocument01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { cn } from "@pi-dash/design-system/lib/utils";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { Link } from "@tanstack/react-router";

import {
  epochToIso,
  formatIso,
  todayIso,
} from "@/components/governance/register-data";
import { Tag } from "@/components/shared/status-badge";

interface Item {
  dueOn: string | null;
  id: string;
  titles: string[];
}

/**
 * Circulars waiting for the signed-in trustee's signature or objection, one
 * row per circular. Empty for everyone else, so it renders nothing for most
 * people.
 */
export function AwaitingMyVote() {
  const [rows] = useQuery(queries.resolution.awaitingMe());
  const byCircular = new Map<string, Item>();
  const inPosition = [...rows].sort(
    (a, b) => (a.resolution?.position ?? 0) - (b.resolution?.position ?? 0)
  );
  for (const r of inPosition) {
    const circular = r.resolution?.circular;
    if (!circular) {
      continue;
    }
    const item = byCircular.get(circular.id) ?? {
      dueOn: epochToIso(circular.responseDueOn),
      id: circular.id,
      titles: [],
    };
    item.titles.push(r.resolution?.title ?? "");
    byCircular.set(circular.id, item);
  }
  const items = [...byCircular.values()].sort((a, b) =>
    (a.dueOn ?? "").localeCompare(b.dueOn ?? "")
  );
  if (items.length === 0) {
    return null;
  }
  const today = todayIso();
  return (
    <Card
      aria-label="Needs your vote or signature"
      className="gap-0 py-0"
      role="region"
    >
      <CardHeader className="border-b px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <HugeiconsIcon
            className="text-muted-foreground size-4"
            icon={LegalDocument01Icon}
            strokeWidth={2}
          />
          Needs your vote or signature
          <Tag className="font-mono tabular-nums">{items.length}</Tag>
        </CardTitle>
      </CardHeader>
      <CardContent className="divide-y px-0">
        {items.map((item) => {
          const late = item.dueOn !== null && item.dueOn <= today;
          return (
            <div
              className="hover:bg-muted/40 relative flex items-center justify-between gap-3 px-4 py-2.5 transition-colors"
              key={item.id}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {item.titles.length === 1
                    ? item.titles[0]
                    : `${item.titles.length} resolutions: ${item.titles.join(", ")}`}
                </p>
                <p
                  className={cn(
                    "text-xs",
                    late ? "text-warning-foreground" : "text-muted-foreground"
                  )}
                >
                  Circular · respond by {formatIso(item.dueOn)}
                </p>
              </div>
              <Link
                className="text-primary flex items-center gap-1 text-xs font-medium whitespace-nowrap after:absolute after:inset-0"
                params={{ circularId: item.id }}
                to="/governance/resolutions/circulars/$circularId"
              >
                Respond
                <HugeiconsIcon
                  className="size-3.5"
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                />
              </Link>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
