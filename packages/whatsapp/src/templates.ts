/**
 * WhatsApp Cloud API message templates: one per notification pi-dash sends
 * to a person. Business-initiated messages on the official API must use an
 * approved template, so this file is the list submitted to Meta and the
 * contract the sender fills in.
 *
 * Rules Meta enforces (checked in templates.test.ts):
 * - names are lowercase letters, digits and underscores;
 * - parameters are named, lowercase, and each needs an example;
 * - the body is at most 1024 characters and can't start or end with a
 *   parameter, even one followed only by punctuation;
 * - there must be enough fixed words per parameter (2 failed, 2.5 passed);
 * - buttons can't link to chat.whatsapp.com;
 * - parameter values can't contain new lines, so values are flattened
 *   before sending.
 *
 * Every template is UTILITY: it is about the recipient's own account,
 * request, team or event, with no promotional wording. Meta moves templates
 * it reads as marketing to MARKETING (several times the price), and
 * repeatedly misfiling them restricts the account, so keep new copy plain.
 */

export type TemplateCategory = "UTILITY" | "MARKETING";

export interface WhatsAppTemplate {
  body: string;
  /** Label for the dashboard button, when "Open dashboard" doesn't fit. */
  buttonText?: string;
  category: TemplateCategory;
  /**
   * Adds an "Open dashboard" URL button: the app URL plus a path suffix
   * that the sender supplies. The value is the example path; an empty
   * string makes a fixed link to the app's home page, with no suffix.
   */
  dashboardPath?: string;
  /** One example value per `{{parameter}}` in the body. */
  examples: Record<string, string>;
  name: string;
}

export const TEMPLATE_LANGUAGE = "en";
export const TEMPLATE_FOOTER = "Proud Indian · Change alerts in Settings";
export const DASHBOARD_BUTTON_TEXT = "Open dashboard";

const EVENT_DETAILS_EXAMPLE = "on Sat, 18 Oct, 10:00 AM at Cubbon Park";

export const WHATSAPP_TEMPLATES = [
  // ── Account ───────────────────────────────────────────────────────────────
  {
    body: "Hi {{name}}, your Proud Indian Dashboard account is ready. You can sign in now.",
    category: "UTILITY",
    dashboardPath: "",
    examples: { name: "Priya" },
    name: "account_welcome",
  },
  {
    body: "Your role on Proud Indian Dashboard is now {{role}}. Sign in to see what you can do.",
    category: "UTILITY",
    dashboardPath: "",
    examples: { role: "Volunteer" },
    name: "account_role_changed",
  },
  {
    body: "Your Proud Indian Dashboard account has been suspended. Reason: {{reason}}. Contact your admin if you have questions.",
    category: "UTILITY",
    examples: { reason: "Repeated missed shifts" },
    name: "account_suspended",
  },
  {
    body: "Your Proud Indian Dashboard account has been suspended. Contact your admin if you have questions.",
    category: "UTILITY",
    examples: {},
    name: "account_suspended_no_reason",
  },
  {
    body: "Account notice: an admin has reactivated your Proud Indian Dashboard account, so your sign-in works again. If you didn't expect this, contact your admin.",
    category: "UTILITY",
    dashboardPath: "",
    examples: {},
    name: "account_reactivated",
  },
  {
    body: "Your Proud Indian Dashboard account has been deactivated. Contact your admin if you have questions.",
    category: "UTILITY",
    examples: {},
    name: "account_deactivated",
  },
  {
    body: "An admin reset your Proud Indian Dashboard password. If you didn't expect this, contact your admin right away.",
    category: "UTILITY",
    examples: {},
    name: "account_password_reset",
  },
  {
    body: "Your Guardian access to {{edition}} is ready. You can now open Kalakriti in Proud Indian Dashboard.",
    category: "UTILITY",
    dashboardPath: "kalakriti/2026",
    examples: { edition: "Kalakriti 2026" },
    // kalakriti_guardian_access was rejected: its login wording read as
    // authentication, so this is the reworded replacement.
    name: "kalakriti_guardian_ready",
  },

  // ── Requests: reimbursements, advance payments, vendor payments ──────────
  {
    body: 'There is a new {{request_type}} waiting for your review: "{{title}}" for {{amount}}, submitted by {{submitter}} on Proud Indian Dashboard.',
    category: "UTILITY",
    dashboardPath: "reimbursements/0192",
    examples: {
      amount: "₹1,250",
      request_type: "reimbursement",
      submitter: "Priya Sharma",
      title: "Snacks for Sunday class",
    },
    name: "request_submitted",
  },
  {
    body: 'Update on your request: your {{request_type}} "{{title}}" for {{amount}} has been approved. You can see the details in the dashboard.',
    category: "UTILITY",
    dashboardPath: "reimbursements/0192",
    examples: {
      amount: "₹1,250",
      request_type: "reimbursement",
      title: "Snacks for Sunday class",
    },
    name: "request_approved",
  },
  {
    body: 'Your {{request_type}} "{{title}}" for {{amount}} has been approved. Note from the approver: {{note}}. Open the dashboard for details.',
    category: "UTILITY",
    dashboardPath: "reimbursements/0192",
    examples: {
      amount: "₹1,250",
      note: "Paid to your bank account on file",
      request_type: "reimbursement",
      title: "Snacks for Sunday class",
    },
    name: "request_approved_with_note",
  },
  {
    body: 'Your {{request_type}} "{{title}}" for {{amount}} wasn\'t approved. Reason: {{reason}}. Open the dashboard for details.',
    category: "UTILITY",
    dashboardPath: "reimbursements/0192",
    examples: {
      amount: "₹1,250",
      reason: "The bill photo is unreadable",
      request_type: "reimbursement",
      title: "Snacks for Sunday class",
    },
    name: "request_not_approved",
  },
  {
    body: "Approval needed: {{waiting}} submitted to you have been waiting for your approval for 3 days or more. The people who submitted them can't be paid until you approve or reject them.",
    category: "UTILITY",
    dashboardPath: "",
    examples: { waiting: "2 reimbursements, 1 vendor payment" },
    name: "requests_awaiting_approval",
  },
  {
    body: 'Request update: {{raised_by}} raised the reimbursement "{{title}}" on your behalf. It is yours now, and you will be reimbursed once it is approved.',
    category: "UTILITY",
    dashboardPath: "reimbursements/0192",
    examples: { raised_by: "Anita Rao", title: "Snacks for Sunday class" },
    name: "reimbursement_raised_for_you",
  },
  {
    body: 'Request update: {{changed_by}} moved the reimbursement "{{title}}" to you, so you will be reimbursed for it. Reason given: {{reason}}. Open the dashboard for details.',
    category: "UTILITY",
    dashboardPath: "reimbursements/0192",
    examples: {
      changed_by: "Anita Rao",
      reason: "You paid for the snacks",
      title: "Snacks for Sunday class",
    },
    name: "reimbursement_now_yours",
  },
  {
    // No button: the previous claimant can no longer open the request.
    body: 'Request update: {{changed_by}} moved the reimbursement "{{title}}" to {{new_claimant}}. Reason given: {{reason}}. It no longer appears in your requests and will not be paid to you.',
    category: "UTILITY",
    examples: {
      changed_by: "Anita Rao",
      new_claimant: "Priya Sharma",
      reason: "Priya paid for the snacks",
      title: "Snacks for Sunday class",
    },
    name: "reimbursement_moved_away",
  },

  // ── Vendor payments: invoices and payments ────────────────────────────────
  {
    body: 'New invoice to review: {{submitter}} uploaded an invoice for the vendor payment "{{title}}".',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: { submitter: "Priya Sharma", title: "Bus hire, October" },
    name: "invoice_submitted",
  },
  {
    body: 'New request to review: {{submitter}} wants to close the vendor payment "{{title}}" without an invoice ({{no_invoice_reason}}, {{proof}}).',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: {
      no_invoice_reason: "Vendor doesn't issue invoices",
      proof: "2 proof files",
      submitter: "Priya Sharma",
      title: "Bus hire, October",
    },
    name: "no_invoice_submitted",
  },
  {
    body: 'Your invoice for the vendor payment "{{title}}" has been approved.',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: { title: "Bus hire, October" },
    name: "invoice_approved",
  },
  {
    body: 'Your invoice for the vendor payment "{{title}}" has been approved. Note from the approver: {{note}}. Open the dashboard for details.',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: { note: "Filed under transport", title: "Bus hire, October" },
    name: "invoice_approved_with_note",
  },
  {
    body: 'The vendor payment "{{title}}" was approved without an invoice and is now complete.',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: { title: "Bus hire, October" },
    name: "no_invoice_approved",
  },
  {
    body: 'The vendor payment "{{title}}" was approved without an invoice and is now complete. Note from the approver: {{note}}. Open the dashboard for details.',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: { note: "Receipt photo accepted", title: "Bus hire, October" },
    name: "no_invoice_approved_with_note",
  },
  {
    body: 'Your invoice for the vendor payment "{{title}}" wasn\'t approved. Reason: {{reason}}. Open the dashboard for details.',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: {
      reason: "The GST number is missing",
      title: "Bus hire, October",
    },
    name: "invoice_not_approved",
  },
  {
    body: 'Your request to close the vendor payment "{{title}}" without an invoice wasn\'t approved. Reason: {{reason}}. Open the dashboard for details.',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: {
      reason: "Please ask the vendor for an invoice",
      title: "Bus hire, October",
    },
    name: "no_invoice_not_approved",
  },
  {
    body: 'New payment to review: {{submitter}} logged a payment of {{amount}} for the vendor payment "{{title}}".',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: {
      amount: "₹8,000",
      submitter: "Priya Sharma",
      title: "Bus hire, October",
    },
    name: "payment_logged",
  },
  {
    body: 'Your payment of {{amount}} for the vendor payment "{{title}}" has been approved.',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: { amount: "₹8,000", title: "Bus hire, October" },
    name: "payment_approved",
  },
  {
    body: 'Your payment of {{amount}} for the vendor payment "{{title}}" has been approved. Note from the approver: {{note}}. Open the dashboard for details.',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: {
      amount: "₹8,000",
      note: "Matched to the bank statement",
      title: "Bus hire, October",
    },
    name: "payment_approved_with_note",
  },
  {
    body: 'Your payment of {{amount}} for the vendor payment "{{title}}" wasn\'t approved. Reason: {{reason}}. Open the dashboard for details.',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: {
      amount: "₹8,000",
      reason: "The UTR number doesn't match",
      title: "Bus hire, October",
    },
    name: "payment_not_approved",
  },
  {
    body: 'All payments for the vendor payment "{{title}}" are complete. Nothing more is needed from you.',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: { title: "Bus hire, October" },
    name: "vendor_payment_complete",
  },
  {
    body: 'Pending payments for the vendor payment "{{title}}" were rejected automatically ({{count}} in total). Reason: {{reason}}. Open the dashboard for details.',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: {
      count: "2",
      reason: "The vendor payment was rejected",
      title: "Bus hire, October",
    },
    name: "payments_auto_rejected",
  },
  {
    body: 'Your vendor "{{vendor}}" has been approved and can now be used for payments.',
    category: "UTILITY",
    dashboardPath: "vendors",
    examples: { vendor: "Sri Balaji Travels" },
    name: "vendor_approved",
  },
  {
    body: 'Your vendor "{{vendor}}" was approved together with the vendor payment "{{title}}".',
    category: "UTILITY",
    dashboardPath: "vendors",
    examples: { title: "Bus hire, October", vendor: "Sri Balaji Travels" },
    name: "vendor_auto_approved",
  },
  {
    body: 'Your vendor "{{vendor}}" needs changes before it can be approved. Open it in the dashboard to see what to fix.',
    category: "UTILITY",
    dashboardPath: "vendors",
    examples: { vendor: "Sri Balaji Travels" },
    name: "vendor_needs_changes",
  },

  // ── Teams ─────────────────────────────────────────────────────────────────
  {
    body: "You've been added to the team {{team}} on Proud Indian Dashboard.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { team: "Sunday Teaching" },
    name: "team_added",
  },
  {
    body: "You've been moved out of the team {{team}} on Proud Indian Dashboard.",
    category: "UTILITY",
    dashboardPath: "teams",
    examples: { team: "Sunday Teaching" },
    name: "team_removed",
  },
  {
    body: "Your role in the team {{team}} is now {{role}}. Open the team page to see what's changed.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { role: "lead", team: "Sunday Teaching" },
    name: "team_role_changed",
  },
  {
    body: "Team notice: an admin changed the details of your team {{team}}, such as its name or description. Open the team page to see the current details.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { team: "Sunday Teaching" },
    name: "team_details_changed",
  },
  {
    body: "Your team {{team}} has been removed from Proud Indian Dashboard.",
    category: "UTILITY",
    dashboardPath: "teams",
    examples: { team: "Sunday Teaching" },
    name: "team_deleted",
  },

  // ── Events: schedule ──────────────────────────────────────────────────────
  {
    body: "Your team has a new event: {{event}}, {{details}}. Open the team page for details.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { details: EVENT_DETAILS_EXAMPLE, event: "Science Fair" },
    name: "event_created",
  },
  {
    body: "You've been added to {{event}}, {{details}}. See you there.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { details: EVENT_DETAILS_EXAMPLE, event: "Science Fair" },
    name: "event_added",
  },
  {
    body: "You've been removed from the event {{event}}. No action is needed from you.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { event: "Science Fair" },
    name: "event_removed",
  },
  {
    body: "Schedule change: the event {{event}} that you're part of has changed and is now {{details}}. Please plan around the new time and place.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { details: EVENT_DETAILS_EXAMPLE, event: "Science Fair" },
    name: "event_schedule_changed",
  },
  {
    body: "The event {{event}} has been cancelled.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { event: "Science Fair" },
    name: "event_cancelled",
  },
  {
    body: "The {{event}} session on {{when}} has been cancelled. Other sessions go ahead as planned.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { event: "Weekly Science Class", when: "Sat, 18 Oct, 10:00 AM" },
    name: "event_session_cancelled",
  },
  {
    body: "The {{event}} sessions from {{when}} onwards have been cancelled.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { event: "Weekly Science Class", when: "Sat, 18 Oct, 10:00 AM" },
    name: "event_sessions_cancelled_from",
  },
  {
    body: "The upcoming sessions of {{event}} have been cancelled.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { event: "Weekly Science Class" },
    name: "event_upcoming_sessions_cancelled",
  },
  {
    body: "Reminder: the event {{event}} that you're part of starts in {{starts_in}}, {{details}}. Please check the event page for any last-minute changes.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: {
      details: EVENT_DETAILS_EXAMPLE,
      event: "Science Fair",
      starts_in: "2 hours",
    },
    name: "event_reminder",
  },
  {
    body: "RSVP check: {{voter}} answered \"{{answer}}\" for {{event}} but isn't on the event's team.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: {
      answer: "yes",
      event: "Science Fair",
      voter: "Priya Sharma",
    },
    name: "rsvp_non_member",
  },
  {
    body: "Attendance for {{event}} hasn't been marked yet. Please mark it in the dashboard.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair (18 Oct)" },
    name: "event_attendance_reminder",
  },

  // ── Events: posted updates ────────────────────────────────────────────────
  {
    body: "There's a new update on {{event}} from {{author}}. Open the event page to read it.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { author: "Priya Sharma", event: "Science Fair (18 Oct)" },
    name: "event_update_posted",
  },
  {
    body: "Approval needed: a post by {{author}} on the event page for {{event}} is waiting for your approval. Team members won't see it until you approve it.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { author: "Priya Sharma", event: "Science Fair (18 Oct)" },
    name: "event_post_needs_approval",
  },
  {
    body: "Your post on the event page for {{event}} was approved and is now visible to the team.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair (18 Oct)" },
    name: "event_post_approved",
  },
  {
    body: "Your post on the event page for {{event}} was not approved, so team members won't see it.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair (18 Oct)" },
    name: "event_post_not_approved",
  },

  // ── Events: interest ──────────────────────────────────────────────────────
  {
    body: "A volunteer, {{volunteer}}, has asked to join {{event}}. Please review the request.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair", volunteer: "Priya Sharma" },
    name: "event_interest_received",
  },
  {
    body: "You've been approved to join {{event}}. Open the event page for details.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair" },
    name: "event_interest_approved",
  },
  {
    body: "Your request to join {{event}} wasn't approved this time.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair" },
    name: "event_interest_declined",
  },
  {
    body: "A volunteer, {{volunteer}}, has left the event {{event}}. You may want to check that the event still has enough volunteers.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair", volunteer: "Priya Sharma" },
    name: "event_volunteer_left",
  },

  // ── Events: photos ────────────────────────────────────────────────────────
  {
    body: "The photos you uploaded for {{event}} have been reviewed: {{count}} approved and published.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { count: "3", event: "Science Fair" },
    name: "photos_approved",
  },
  {
    body: "The photos you uploaded for {{event}} have been reviewed: {{count}} not published.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { count: "1", event: "Science Fair" },
    name: "photos_not_published",
  },
  {
    body: "Approval needed: {{photos}} uploaded by volunteers across {{events}} are waiting for your approval. They won't appear on the event pages until you approve them.",
    category: "UTILITY",
    dashboardPath: "events",
    examples: { events: "2 events", photos: "14 photos" },
    name: "photos_need_approval",
  },
  {
    body: "You took part in {{event}}. If you have photos from it, you can upload them to the event page.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair" },
    name: "photos_upload_request",
  },

  // ── Events: feedback ──────────────────────────────────────────────────────
  {
    body: "Anonymous feedback is open for {{event}}, which you took part in. You can share it from the event page.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair" },
    name: "feedback_open",
  },
  {
    body: "Feedback for {{event}}, which you took part in, closes tomorrow. It's anonymous.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair" },
    name: "feedback_closing",
  },

  // ── Kalakriti ─────────────────────────────────────────────────────────────
  {
    body: "Registration for {{edition}} is {{status}}. Open Kalakriti for details.",
    category: "UTILITY",
    dashboardPath: "kalakriti/2026",
    examples: { edition: "Kalakriti 2026", status: "now open" },
    name: "kalakriti_registration",
  },
  {
    body: "The schedule for {{edition}} has changed. Please check the latest schedule.",
    category: "UTILITY",
    dashboardPath: "kalakriti/2026/schedule",
    examples: { edition: "Kalakriti 2026" },
    name: "kalakriti_schedule_changed",
  },
  {
    body: "Transport details for your Center in {{edition}} have changed. Please check the bus and driver details.",
    category: "UTILITY",
    dashboardPath: "kalakriti/2026/centers?centerId=0192",
    examples: { edition: "Kalakriti 2026" },
    name: "kalakriti_transport_changed",
  },
  {
    body: "Access notice: an administrator has reactivated your Guardian access for {{edition}}. If you didn't expect this, contact your administrator.",
    category: "UTILITY",
    dashboardPath: "kalakriti/2026",
    examples: { edition: "Kalakriti 2026" },
    name: "kalakriti_guardian_reactivated",
  },

  // ── WhatsApp groups ───────────────────────────────────────────────────────
  {
    body: "You've been added to {{joined}}. Join its WhatsApp group, {{group}}, for updates and plans.",
    category: "UTILITY",
    examples: {
      group: "Sunday Teaching Volunteers",
      joined: "the team Sunday Teaching",
    },
    buttonText: "Join group",
    // Meta doesn't allow chat.whatsapp.com links in buttons, so the button
    // opens a dashboard page that redirects to the group's invite link.
    dashboardPath: "whatsapp-groups/0192/join",
    name: "group_invite",
  },
  {
    body: "You haven't joined the WhatsApp group {{group}} yet. Join it by {{date}} to keep your Proud Indian Dashboard account active.",
    category: "UTILITY",
    examples: { date: "Wed, 18 Nov", group: "Proud Indian Volunteers" },
    buttonText: "Join group",
    dashboardPath: "whatsapp-groups/0192/join",
    name: "group_join_reminder",
  },

  // ── Digests ───────────────────────────────────────────────────────────────
  {
    body: "Summary of {{count}} notifications about your account in {{topic}}: {{summary}}. Each one is listed in your dashboard notifications.",
    category: "UTILITY",
    dashboardPath: "reimbursements",
    examples: {
      count: "3",
      summary:
        'Reimbursement "Snacks" approved; Reimbursement "Auto fare" approved; Advance payment "Art supplies" not approved',
      topic: "Approvals and rejections",
    },
    name: "notifications_summary",
  },
  {
    body: "Today's social media posts are ready for your approval: {{summary}}. Review them in the dashboard.",
    category: "UTILITY",
    dashboardPath: "social",
    examples: {
      summary: "Schedule post for Science Fair; Recap of Sunday class",
    },
    name: "social_digest",
  },
] as const satisfies readonly WhatsAppTemplate[];

export type WhatsAppTemplateName = (typeof WHATSAPP_TEMPLATES)[number]["name"];

const PARAMETER = /\{\{([a-z_]+)\}\}/g;

/** The `{{parameter}}` names a template body uses, in order. */
export function templateParameters(body: string): string[] {
  return [...body.matchAll(PARAMETER)].map((match) => match[1] as string);
}

interface NamedParameter {
  example: string;
  param_name: string;
}

interface UrlButton {
  example?: string[];
  text: string;
  type: "URL";
  url: string;
}

type TemplateComponent =
  | {
      example?: { body_text_named_params: NamedParameter[] };
      text: string;
      type: "BODY";
    }
  | { text: string; type: "FOOTER" }
  | { buttons: UrlButton[]; type: "BUTTONS" };

export interface TemplateCreatePayload {
  category: TemplateCategory;
  components: TemplateComponent[];
  language: string;
  name: string;
  parameter_format: "named";
}

function urlButton(text: string, base: string, example?: string): UrlButton {
  return example === undefined
    ? { text, type: "URL", url: base }
    : {
        example: [`${base}${example}`],
        text,
        type: "URL",
        url: `${base}{{1}}`,
      };
}

/** The body Meta's `POST /{waba-id}/message_templates` expects. */
export function toTemplatePayload(
  template: WhatsAppTemplate,
  appUrl: string
): TemplateCreatePayload {
  const parameters = templateParameters(template.body);
  const buttons: UrlButton[] = [];
  if (template.dashboardPath !== undefined) {
    const base = `${appUrl.replace(/\/+$/, "")}/`;
    buttons.push(
      urlButton(
        template.buttonText ?? DASHBOARD_BUTTON_TEXT,
        base,
        template.dashboardPath === "" ? undefined : template.dashboardPath
      )
    );
  }
  return {
    category: template.category,
    components: [
      {
        ...(parameters.length > 0
          ? {
              example: {
                body_text_named_params: parameters.map((name) => ({
                  example: template.examples[name] as string,
                  param_name: name,
                })),
              },
            }
          : {}),
        text: template.body,
        type: "BODY",
      },
      { text: TEMPLATE_FOOTER, type: "FOOTER" },
      ...(buttons.length > 0 ? [{ buttons, type: "BUTTONS" as const }] : []),
    ],
    language: TEMPLATE_LANGUAGE,
    name: template.name,
    parameter_format: "named",
  };
}
