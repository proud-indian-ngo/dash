export const KALAKRITI_ACTORS = {
  categoryLead: {
    authFile: ".auth/kalakriti_category_lead.json",
    email: "kalakriti-category-lead@pi-dash.test",
    password: "KalakritiCategoryLead123!",
  },
  dormantExternalUser: {
    email: "kalakriti-dormant@pi-dash.test",
    password: "KalakritiDormant123!",
  },
  editionAdmin: {
    authFile: ".auth/kalakriti_edition_admin.json",
    email: "kalakriti-edition-admin@pi-dash.test",
    password: "KalakritiEditionAdmin123!",
  },
  guardian: {
    authFile: ".auth/kalakriti-guardian.json",
    email: "kalakriti-guardian@pi-dash.test",
    password: "KalakritiGuardian123!",
  },
  liaison: {
    authFile: ".auth/kalakriti-liaison.json",
    email: "kalakriti-liaison@pi-dash.test",
    password: "KalakritiLiaison123!",
  },
  overallEventsLead: {
    authFile: ".auth/kalakriti_overall_events_lead.json",
    email: "kalakriti-overall-events-lead@pi-dash.test",
    password: "KalakritiOverallEventsLead123!",
  },
  unrelatedVolunteer: {
    authFile: ".auth/kalakriti-unrelated-volunteer.json",
    email: "kalakriti-unrelated-volunteer@pi-dash.test",
    password: "KalakritiUnrelatedVolunteer123!",
  },
  volunteerCoordinator: {
    authFile: ".auth/kalakriti_volunteer_coordinator.json",
    email: "kalakriti-volunteer-coordinator@pi-dash.test",
    password: "KalakritiVolunteerCoordinator123!",
  },
} as const;

export type KalakritiActorName = keyof typeof KALAKRITI_ACTORS;
