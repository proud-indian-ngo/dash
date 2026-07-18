export const KALAKRITI_ACTORS = {
  categoryLead: {
    authFile: ".auth/kalakriti_category_lead.json",
    get email() {
      return (
        process.env.KALAKRITI_CATEGORY_LEAD_EMAIL ??
        "kalakriti-category-lead@pi-dash.test"
      );
    },
    get password() {
      return (
        process.env.KALAKRITI_CATEGORY_LEAD_PASSWORD ??
        "KalakritiCategoryLead123!"
      );
    },
  },
  dormantExternalUser: {
    get email() {
      return (
        process.env.KALAKRITI_DORMANT_EXTERNAL_USER_EMAIL ??
        "kalakriti-dormant@pi-dash.test"
      );
    },
    get password() {
      return (
        process.env.KALAKRITI_DORMANT_EXTERNAL_USER_PASSWORD ??
        "KalakritiDormant123!"
      );
    },
  },
  editionAdmin: {
    authFile: ".auth/kalakriti_edition_admin.json",
    get email() {
      return (
        process.env.KALAKRITI_EDITION_ADMIN_EMAIL ??
        "kalakriti-edition-admin@pi-dash.test"
      );
    },
    get password() {
      return (
        process.env.KALAKRITI_EDITION_ADMIN_PASSWORD ??
        "KalakritiEditionAdmin123!"
      );
    },
  },
  guardian: {
    authFile: ".auth/kalakriti-guardian.json",
    get email() {
      return (
        process.env.KALAKRITI_GUARDIAN_EMAIL ??
        "kalakriti-guardian@pi-dash.test"
      );
    },
    get password() {
      return process.env.KALAKRITI_GUARDIAN_PASSWORD ?? "KalakritiGuardian123!";
    },
  },
  liaison: {
    authFile: ".auth/kalakriti-liaison.json",
    get email() {
      return (
        process.env.KALAKRITI_LIAISON_EMAIL ?? "kalakriti-liaison@pi-dash.test"
      );
    },
    get password() {
      return process.env.KALAKRITI_LIAISON_PASSWORD ?? "KalakritiLiaison123!";
    },
  },
  overallEventsLead: {
    authFile: ".auth/kalakriti_overall_events_lead.json",
    get email() {
      return (
        process.env.KALAKRITI_OVERALL_EVENTS_LEAD_EMAIL ??
        "kalakriti-overall-events-lead@pi-dash.test"
      );
    },
    get password() {
      return (
        process.env.KALAKRITI_OVERALL_EVENTS_LEAD_PASSWORD ??
        "KalakritiOverallEventsLead123!"
      );
    },
  },
  unrelatedVolunteer: {
    authFile: ".auth/kalakriti-unrelated-volunteer.json",
    get email() {
      return (
        process.env.KALAKRITI_UNRELATED_VOLUNTEER_EMAIL ??
        "kalakriti-unrelated-volunteer@pi-dash.test"
      );
    },
    get password() {
      return (
        process.env.KALAKRITI_UNRELATED_VOLUNTEER_PASSWORD ??
        "KalakritiUnrelatedVolunteer123!"
      );
    },
  },
  volunteerCoordinator: {
    authFile: ".auth/kalakriti_volunteer_coordinator.json",
    get email() {
      return (
        process.env.KALAKRITI_VOLUNTEER_COORDINATOR_EMAIL ??
        "kalakriti-volunteer-coordinator@pi-dash.test"
      );
    },
    get password() {
      return (
        process.env.KALAKRITI_VOLUNTEER_COORDINATOR_PASSWORD ??
        "KalakritiVolunteerCoordinator123!"
      );
    },
  },
} as const;

export type KalakritiActorName = keyof typeof KALAKRITI_ACTORS;
