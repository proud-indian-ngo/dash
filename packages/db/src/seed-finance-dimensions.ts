import {
  APP_CONFIG_FINANCE_THRESHOLD_KEY,
  COST_CENTRE_IDS,
  DEFAULT_FINANCE_THRESHOLD_PAISE,
  FISCAL_YEAR_IDS,
  GENERAL_FUND_ID,
  PROGRAMME_IDS,
} from "@pi-dash/shared/constants";

import { buildFiscalPeriods } from "./fiscal-years";
import { db } from "./index";
import { appConfig } from "./schema/app-config";
import {
  costCentre,
  fiscalPeriod,
  fiscalYear,
  fund,
  programme,
} from "./schema/finance-dimensions";

/**
 * The finance reference rows every environment needs: programmes, cost
 * centres, the general fund, fiscal years with their periods and the default
 * approval threshold. Migration 0112 inserts the same rows in production;
 * environments built with `drizzle-kit push` (CI, fresh dev databases) call
 * this instead. Every insert ignores conflicts, so it is safe to re-run.
 */
export async function ensureFinanceDimensions(): Promise<void> {
  const now = new Date();
  await db
    .insert(programme)
    .values([
      {
        cause: "education",
        code: "EDU",
        createdAt: now,
        description:
          "Classes and learning support for children: art, maths, spoken English.",
        id: PROGRAMME_IDS.education,
        name: "Education",
        sortOrder: 10,
        updatedAt: now,
      },
      {
        cause: "arts",
        code: "ART",
        createdAt: now,
        description: "Kalakriti and other arts programmes.",
        id: PROGRAMME_IDS.artsAndCulture,
        name: "Arts and culture",
        sortOrder: 20,
        updatedAt: now,
      },
      {
        cause: "community",
        code: "COM",
        createdAt: now,
        description:
          "Distribution drives, outings, elder care, environment and corporate engagement days.",
        id: PROGRAMME_IDS.communitySupport,
        name: "Community support",
        sortOrder: 30,
        updatedAt: now,
      },
      {
        cause: null,
        code: "UNALLOC",
        createdAt: now,
        description:
          "Holding programme for legacy records with no programme; finance clears it before year close.",
        id: PROGRAMME_IDS.unallocated,
        name: "Unallocated",
        sortOrder: 900,
        updatedAt: now,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(costCentre)
    .values([
      {
        code: "BLR",
        createdAt: now,
        id: COST_CENTRE_IDS.bangalore,
        name: "Bangalore",
        stateUt: "Karnataka",
        updatedAt: now,
      },
      {
        active: false,
        code: "MUM",
        createdAt: now,
        id: COST_CENTRE_IDS.mumbai,
        name: "Mumbai",
        stateUt: "Maharashtra",
        updatedAt: now,
      },
    ])
    .onConflictDoNothing();

  await db
    .insert(fund)
    .values({
      code: "GEN",
      createdAt: now,
      description: "Unrestricted domestic funds.",
      id: GENERAL_FUND_ID,
      name: "General Fund (Domestic)",
      updatedAt: now,
    })
    .onConflictDoNothing();

  // Fixed IDs for the seeded years; a year the ensure job created first keeps
  // its own ID, so periods are always attached to the row that exists.
  const years = Object.entries(FISCAL_YEAR_IDS).map(([label, id]) => ({
    id,
    start: Number(label.slice(0, 4)),
  }));
  await db
    .insert(fiscalYear)
    .values(
      years.map((y) => ({
        endsOn: `${y.start + 1}-03-31`,
        id: y.id,
        label: `${y.start}-${String(y.start + 1).slice(2)}`,
        startsOn: `${y.start}-04-01`,
      }))
    )
    .onConflictDoNothing({ target: fiscalYear.label });
  const existingYears = await db
    .select({ id: fiscalYear.id, label: fiscalYear.label })
    .from(fiscalYear);
  const idByLabel = new Map(existingYears.map((y) => [y.label, y.id]));
  const periods = years.flatMap((y, yi) =>
    buildFiscalPeriods(
      y.start,
      idByLabel.get(`${y.start}-${String(y.start + 1).slice(2)}`) ?? y.id,
      (month) =>
        `01930000-0000-7000-8000-0000004${String(yi * 12 + month).padStart(5, "0")}`
    )
  );
  await db.insert(fiscalPeriod).values(periods).onConflictDoNothing();

  await db
    .insert(appConfig)
    .values({
      key: APP_CONFIG_FINANCE_THRESHOLD_KEY,
      updatedAt: now,
      value: String(DEFAULT_FINANCE_THRESHOLD_PAISE),
    })
    .onConflictDoNothing();
}
