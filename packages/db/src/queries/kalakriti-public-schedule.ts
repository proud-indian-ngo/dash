import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "..";
import {
  kalakritiAgeCategory,
  kalakritiCompetition,
  kalakritiCompetitionDivision,
  kalakritiCompetitionSession,
  kalakritiEdition,
  kalakritiVenue,
} from "../schema/kalakriti";

const PUBLIC_EDITION_LIFECYCLES = [
  "registration_open",
  "registration_locked",
  "live",
  "archived",
] as const;

export async function getKalakritiPublicSchedule(year: number) {
  const [edition] = await db
    .select({
      eventDate: kalakritiEdition.eventDate,
      id: kalakritiEdition.id,
      name: kalakritiEdition.name,
      teamEventId: kalakritiEdition.teamEventId,
      timezone: kalakritiEdition.timezone,
      year: kalakritiEdition.year,
    })
    .from(kalakritiEdition)
    .where(
      and(
        eq(kalakritiEdition.year, year),
        inArray(kalakritiEdition.lifecycle, PUBLIC_EDITION_LIFECYCLES)
      )
    )
    .limit(1);

  if (!edition) {
    return null;
  }

  const sessions = await db
    .select({
      ageCategory: kalakritiAgeCategory.name,
      competition: kalakritiCompetition.name,
      competitionCancelledAt: kalakritiCompetition.cancelledAt,
      endAt: kalakritiCompetitionSession.endAt,
      sessionCancelledAt: kalakritiCompetitionSession.cancelledAt,
      startAt: kalakritiCompetitionSession.startAt,
      venue: kalakritiVenue.name,
    })
    .from(kalakritiCompetitionSession)
    .innerJoin(
      kalakritiCompetitionDivision,
      and(
        eq(kalakritiCompetitionDivision.editionId, edition.id),
        eq(
          kalakritiCompetitionDivision.id,
          kalakritiCompetitionSession.divisionId
        )
      )
    )
    .innerJoin(
      kalakritiCompetition,
      and(
        eq(kalakritiCompetition.editionId, edition.id),
        eq(kalakritiCompetition.id, kalakritiCompetitionDivision.competitionId)
      )
    )
    .innerJoin(
      kalakritiAgeCategory,
      and(
        eq(kalakritiAgeCategory.editionId, edition.id),
        eq(kalakritiAgeCategory.id, kalakritiCompetitionDivision.ageCategoryId)
      )
    )
    .innerJoin(
      kalakritiVenue,
      and(
        eq(kalakritiVenue.editionId, edition.id),
        eq(kalakritiVenue.id, kalakritiCompetitionSession.venueId)
      )
    )
    .where(eq(kalakritiCompetitionSession.editionId, edition.id))
    .orderBy(
      asc(kalakritiCompetitionSession.startAt),
      asc(kalakritiCompetition.name),
      asc(kalakritiAgeCategory.sortOrder)
    );

  return {
    edition: {
      eventDate: edition.eventDate,
      eventId: edition.teamEventId,
      name: edition.name,
      timezone: edition.timezone,
      year: edition.year,
    },
    sessions: sessions.map((session) => ({
      ageCategory: session.ageCategory,
      competition: session.competition,
      endAt: session.endAt.getTime(),
      startAt: session.startAt.getTime(),
      status:
        session.sessionCancelledAt || session.competitionCancelledAt
          ? ("cancelled" as const)
          : ("scheduled" as const),
      venue: session.venue,
    })),
  };
}
