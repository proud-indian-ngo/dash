import type { CompetitionCategoryFormValue } from "./competition-category-form-dialog";
import type { CompetitionFormValue } from "./competition-form-dialog";
import type { CompetitionSessionFormValue } from "./competition-session-form-dialog";
import type { VenueFormValue } from "./venue-form-dialog";

export interface CompetitionCategoryView extends CompetitionCategoryFormValue {
  retiredAt: number | null;
}

export interface CompetitionCategoryTableRow extends CompetitionCategoryView {
  competitionCount: number;
}

export interface CompetitionView extends CompetitionFormValue {
  cancelledAt: number | null;
  retiredAt: number | null;
}

export interface CompetitionTableRow extends CompetitionView {
  categoryName: string;
}

export interface VenueView extends VenueFormValue {
  retiredAt: number | null;
}

export interface VenueTableRow extends VenueView {
  sessionCount: number;
}

export interface ScheduleTableRow extends CompetitionSessionFormValue {
  ageCategoryName: string;
  capacity: number;
  competitionName: string;
  venueName: string;
}

export interface ConfigurationDeletePayload {
  id: string;
  kind: "category" | "competition" | "session" | "venue";
  name: string;
}

export interface ConfigurationStatePayload {
  action: "Cancel" | "Restore" | "Retire";
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

export function formatConfigurationLabel(value: string): string {
  return value.replaceAll("_", " ");
}

export function getCompetitionStatus(
  competition: CompetitionView
): "active" | "cancelled" | "retired" {
  if (competition.cancelledAt !== null) {
    return "cancelled";
  }
  if (competition.retiredAt !== null) {
    return "retired";
  }
  return "active";
}
