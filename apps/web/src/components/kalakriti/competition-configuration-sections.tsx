import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import type { CompetitionCategoryFormValue } from "./competition-category-form-dialog";
import type { CompetitionFormValue } from "./competition-form-dialog";
import type { CompetitionSessionFormValue } from "./competition-session-form-dialog";
import type { VenueFormValue } from "./venue-form-dialog";

export interface CompetitionCategoryView extends CompetitionCategoryFormValue {
  retiredAt: number | null;
}

export interface CompetitionView extends CompetitionFormValue {
  cancelledAt: number | null;
  retiredAt: number | null;
}

export interface VenueView extends VenueFormValue {
  retiredAt: number | null;
}

export interface ConfigurationDeletePayload {
  id: string;
  kind: "category" | "competition" | "session" | "venue";
  name: string;
}

export interface ConfigurationStatePayload {
  enabled: boolean;
  id: string;
  kind:
    | "category_retired"
    | "competition_cancelled"
    | "competition_retired"
    | "session_cancelled"
    | "venue_retired";
  name: string;
}

function ActionButtons({
  category,
  onDelete,
  onEdit,
  onSetState,
}: {
  category: CompetitionCategoryView;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (category: CompetitionCategoryFormValue) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
}) {
  const handleEdit = useEventCallback(() => onEdit(category));
  const handleRetire = useEventCallback(() =>
    onSetState({
      enabled: category.retiredAt === null,
      id: category.id,
      kind: "category_retired",
      name: category.name,
    })
  );
  const handleDelete = useEventCallback(() =>
    onDelete({
      id: category.id,
      kind: "category",
      name: category.name,
    })
  );
  return (
    <div className="flex flex-wrap gap-1">
      <Button
        aria-label={`Edit ${category.name} Competition Category`}
        onClick={handleEdit}
        size="sm"
        variant="outline"
      >
        Edit
      </Button>
      <Button
        aria-label={`${category.retiredAt === null ? "Retire" : "Restore"} ${category.name} Competition Category`}
        onClick={handleRetire}
        size="sm"
        variant="ghost"
      >
        {category.retiredAt === null ? "Retire" : "Restore"}
      </Button>
      <Button
        aria-label={`Delete ${category.name} Competition Category`}
        onClick={handleDelete}
        size="sm"
        variant="ghost"
      >
        Delete
      </Button>
    </div>
  );
}

function CompetitionRow({
  canManage,
  competition,
  onDelete,
  onEdit,
  onSetState,
}: {
  canManage: boolean;
  competition: CompetitionView;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (competition: CompetitionFormValue) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
}) {
  const handleEdit = useEventCallback(() => onEdit(competition));
  const handleCancel = useEventCallback(() =>
    onSetState({
      enabled: competition.cancelledAt === null,
      id: competition.id,
      kind: "competition_cancelled",
      name: competition.name,
    })
  );
  const handleRetire = useEventCallback(() =>
    onSetState({
      enabled: competition.retiredAt === null,
      id: competition.id,
      kind: "competition_retired",
      name: competition.name,
    })
  );
  const handleDelete = useEventCallback(() =>
    onDelete({
      id: competition.id,
      kind: "competition",
      name: competition.name,
    })
  );
  return (
    <section
      aria-label={`${competition.name} Competition`}
      className="space-y-3 border p-3"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{competition.name}</p>
            <Badge variant="outline">{competition.participationMode}</Badge>
            <Badge variant="outline">{competition.genderEligibility}</Badge>
            {competition.cancelledAt === null ? null : (
              <Badge variant="destructive">cancelled</Badge>
            )}
            {competition.retiredAt === null ? null : (
              <Badge variant="secondary">retired</Badge>
            )}
          </div>
          <p className="mt-1 text-muted-foreground text-xs">
            Group size {competition.minimumGroupSize}-
            {competition.maximumGroupSize}
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap gap-1">
            <Button
              aria-label={`Edit ${competition.name} Competition`}
              onClick={handleEdit}
              size="sm"
              variant="outline"
            >
              Edit
            </Button>
            <Button
              aria-label={`${competition.cancelledAt === null ? "Cancel" : "Restore"} ${competition.name} Competition`}
              onClick={handleCancel}
              size="sm"
              variant="ghost"
            >
              {competition.cancelledAt === null ? "Cancel" : "Restore"}
            </Button>
            <Button
              aria-label={`${competition.retiredAt === null ? "Retire" : "Restore"} ${competition.name} Competition`}
              onClick={handleRetire}
              size="sm"
              variant="ghost"
            >
              {competition.retiredAt === null ? "Retire" : "Restore"}
            </Button>
            <Button
              aria-label={`Delete ${competition.name} Competition`}
              onClick={handleDelete}
              size="sm"
              variant="ghost"
            >
              Delete
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function CompetitionCatalogSection({
  canManage,
  categories,
  competitions,
  onAddCategory,
  onAddCompetition,
  onDelete,
  onEditCategory,
  onEditCompetition,
  onSetState,
}: {
  canManage: boolean;
  categories: readonly CompetitionCategoryView[];
  competitions: readonly CompetitionView[];
  onAddCategory: () => void;
  onAddCompetition: () => void;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEditCategory: (category: CompetitionCategoryFormValue) => void;
  onEditCompetition: (competition: CompetitionFormValue) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
}) {
  return (
    <section
      aria-labelledby="competition-catalog-heading"
      className="space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            className="font-display font-semibold text-xl"
            id="competition-catalog-heading"
          >
            Competition catalog
          </h2>
          <p className="text-muted-foreground text-sm">
            Define Categories and their individual or group Competitions.
          </p>
        </div>
        {canManage ? (
          <div className="flex gap-2">
            <Button onClick={onAddCategory} variant="outline">
              Add Category
            </Button>
            <Button
              disabled={categories.length === 0}
              onClick={onAddCompetition}
            >
              Add Competition
            </Button>
          </div>
        ) : null}
      </div>
      {categories.length === 0 ? (
        <div className="border border-dashed p-8 text-center text-muted-foreground text-sm">
          No Competition Categories configured.
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {categories.map((category) => (
            <Card
              aria-label={`${category.name} Competition Category`}
              key={category.id}
            >
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle>{category.name}</CardTitle>
                      {category.retiredAt === null ? null : (
                        <Badge variant="secondary">retired</Badge>
                      )}
                    </div>
                    <CardDescription>
                      Display order {category.sortOrder}
                    </CardDescription>
                  </div>
                  {canManage ? (
                    <ActionButtons
                      category={category}
                      onDelete={onDelete}
                      onEdit={onEditCategory}
                      onSetState={onSetState}
                    />
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {competitions
                  .filter(
                    (competition) =>
                      competition.competitionCategoryId === category.id
                  )
                  .map((competition) => (
                    <CompetitionRow
                      canManage={canManage}
                      competition={competition}
                      key={competition.id}
                      onDelete={onDelete}
                      onEdit={onEditCompetition}
                      onSetState={onSetState}
                    />
                  ))}
                {competitions.some(
                  (competition) =>
                    competition.competitionCategoryId === category.id
                ) ? null : (
                  <p className="text-muted-foreground text-sm">
                    No Competitions in this Category.
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}

export function VenueSection({
  canManage,
  onAdd,
  onDelete,
  onEdit,
  onSetState,
  venues,
}: {
  canManage: boolean;
  onAdd: () => void;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (venue: VenueFormValue) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  venues: readonly VenueView[];
}) {
  return (
    <section aria-labelledby="venues-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2
            className="font-display font-semibold text-xl"
            id="venues-heading"
          >
            Venues
          </h2>
          <p className="text-muted-foreground text-sm">
            Active locations available to the schedule.
          </p>
        </div>
        {canManage ? <Button onClick={onAdd}>Add Venue</Button> : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {venues.map((venue) => (
          <VenueCard
            canManage={canManage}
            key={venue.id}
            onDelete={onDelete}
            onEdit={onEdit}
            onSetState={onSetState}
            venue={venue}
          />
        ))}
      </div>
      {venues.length === 0 ? (
        <div className="border border-dashed p-8 text-center text-muted-foreground text-sm">
          No Venues configured.
        </div>
      ) : null}
    </section>
  );
}

function VenueCard({
  canManage,
  onDelete,
  onEdit,
  onSetState,
  venue,
}: {
  canManage: boolean;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (venue: VenueFormValue) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  venue: VenueView;
}) {
  const handleEdit = useEventCallback(() => onEdit(venue));
  const handleRetire = useEventCallback(() =>
    onSetState({
      enabled: venue.retiredAt === null,
      id: venue.id,
      kind: "venue_retired",
      name: venue.name,
    })
  );
  const handleDelete = useEventCallback(() =>
    onDelete({ id: venue.id, kind: "venue", name: venue.name })
  );
  return (
    <Card aria-label={`${venue.name} Venue`}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{venue.name}</CardTitle>
          {venue.retiredAt === null ? null : (
            <Badge variant="secondary">retired</Badge>
          )}
        </div>
      </CardHeader>
      {canManage ? (
        <CardContent className="flex flex-wrap gap-1">
          <Button
            aria-label={`Edit ${venue.name} Venue`}
            onClick={handleEdit}
            size="sm"
            variant="outline"
          >
            Edit
          </Button>
          <Button
            aria-label={`${venue.retiredAt === null ? "Retire" : "Restore"} ${venue.name} Venue`}
            onClick={handleRetire}
            size="sm"
            variant="ghost"
          >
            {venue.retiredAt === null ? "Retire" : "Restore"}
          </Button>
          <Button
            aria-label={`Delete ${venue.name} Venue`}
            onClick={handleDelete}
            size="sm"
            variant="ghost"
          >
            Delete
          </Button>
        </CardContent>
      ) : null}
    </Card>
  );
}

export function ScheduleSection({
  ageCategoryNames,
  canManage,
  competitionNames,
  onAdd,
  onDelete,
  onEdit,
  onSetState,
  sessions,
  timeZone,
  venueNames,
}: {
  ageCategoryNames: ReadonlyMap<string, string>;
  canManage: boolean;
  competitionNames: ReadonlyMap<string, string>;
  onAdd: () => void;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (session: CompetitionSessionFormValue) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  sessions: readonly CompetitionSessionFormValue[];
  timeZone: string;
  venueNames: ReadonlyMap<string, string>;
}) {
  const formatter = new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
  });
  return (
    <section aria-labelledby="schedule-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2
            className="font-display font-semibold text-xl"
            id="schedule-heading"
          >
            Competition schedule
          </h2>
          <p className="text-muted-foreground text-sm">
            Sessions cannot overlap in the same Venue.
          </p>
        </div>
        {canManage ? <Button onClick={onAdd}>Add Session</Button> : null}
      </div>
      <div className="space-y-2">
        {sessions.map((session) => (
          <SessionRow
            ageCategoryName={
              ageCategoryNames.get(session.ageCategoryId) ??
              "Unknown Age Category"
            }
            canManage={canManage}
            competitionName={
              competitionNames.get(session.competitionId) ??
              "Unknown Competition"
            }
            formatter={formatter}
            key={session.id}
            onDelete={onDelete}
            onEdit={onEdit}
            onSetState={onSetState}
            session={session}
            venueName={venueNames.get(session.venueId) ?? "Unknown Venue"}
          />
        ))}
      </div>
      {sessions.length === 0 ? (
        <div className="border border-dashed p-8 text-center text-muted-foreground text-sm">
          No Competition Sessions scheduled.
        </div>
      ) : null}
    </section>
  );
}

function SessionRow({
  ageCategoryName,
  canManage,
  competitionName,
  formatter,
  onDelete,
  onEdit,
  onSetState,
  session,
  venueName,
}: {
  ageCategoryName: string;
  canManage: boolean;
  competitionName: string;
  formatter: Intl.DateTimeFormat;
  onDelete: (payload: ConfigurationDeletePayload) => void;
  onEdit: (session: CompetitionSessionFormValue) => void;
  onSetState: (payload: ConfigurationStatePayload) => void;
  session: CompetitionSessionFormValue;
  venueName: string;
}) {
  const label = `${competitionName}, ${ageCategoryName}`;
  const handleEdit = useEventCallback(() => onEdit(session));
  const handleCancel = useEventCallback(() =>
    onSetState({
      enabled: session.cancelledAt === null,
      id: session.id,
      kind: "session_cancelled",
      name: label,
    })
  );
  const handleDelete = useEventCallback(() =>
    onDelete({ id: session.id, kind: "session", name: label })
  );
  return (
    <section
      aria-label={`${label} Session`}
      className="flex flex-wrap items-center justify-between gap-4 border p-4"
    >
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium">{competitionName}</p>
          <Badge variant="outline">{ageCategoryName}</Badge>
          {session.cancelledAt === null ? null : (
            <Badge variant="destructive">cancelled</Badge>
          )}
        </div>
        <p className="mt-1 text-muted-foreground text-sm">
          {formatter.format(session.startAt)}-{formatter.format(session.endAt)}{" "}
          · {venueName} · Capacity {session.capacity}
        </p>
      </div>
      {canManage ? (
        <div className="flex gap-1">
          <Button
            aria-label={`Edit ${label} Session`}
            onClick={handleEdit}
            size="sm"
            variant="outline"
          >
            Edit
          </Button>
          <Button
            aria-label={`${session.cancelledAt === null ? "Cancel" : "Restore"} ${label} Session`}
            onClick={handleCancel}
            size="sm"
            variant="ghost"
          >
            {session.cancelledAt === null ? "Cancel" : "Restore"}
          </Button>
          <Button
            aria-label={`Delete ${label} Session`}
            onClick={handleDelete}
            size="sm"
            variant="ghost"
          >
            Delete
          </Button>
        </div>
      ) : null}
    </section>
  );
}
