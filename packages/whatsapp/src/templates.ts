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
 * - text headers are at most 60 characters; ours are static, with no
 *   parameter, markdown or emoji; document headers need an uploaded sample;
 * - there must be enough fixed words per parameter (2 failed, 2.5 passed);
 * - buttons can't link to chat.whatsapp.com;
 * - parameter values can't contain new lines, so values are flattened
 *   before sending.
 *
 * House style, also checked there: a static text header names what happened,
 * or a document header attaches the file the message is about;
 * the body opens with a plain sentence, then a blank line and the facts as
 * `*Label:* {{value}}` lines when there are two or more. No line is only a
 * parameter, `*bold*` markers pair up on each line, and there is never more
 * than one blank line in a row (the stored copy relies on that, see
 * `preview.ts`).
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
  /** A short label for the header; document labels are metadata only. */
  header?: string;
  /** Defaults to TEXT. DOCUMENT templates attach a file when sent. */
  headerFormat?: "TEXT" | "DOCUMENT";
  /** Override the dashboard-oriented default for external recipients. */
  footer?: string;
  /** A short title for the dashboard, where the template name would show. */
  label: string;
  name: string;
}

export const TEMPLATE_LANGUAGE = "en";
export const TEMPLATE_FOOTER = "Proud Indian · Change alerts in Settings";
export const DASHBOARD_BUTTON_TEXT = "Open dashboard";

const EVENT_DETAILS_EXAMPLE = "on Sat, 18 Oct, 10:00 AM at Cubbon Park";

export const WHATSAPP_TEMPLATES = [
  // ── Donation receipts ────────────────────────────────────────────────────
  {
    body: "Thank you for your donation to Proud Indian.\n\n*Amount:* {{amount}}\n*Receipt number:* {{number}}\n*Date received:* {{received_on}}\n\nYour donation receipt is attached as a PDF.",
    category: "UTILITY",
    examples: {
      amount: "₹5,000",
      number: "PI-2026-0012",
      received_on: "21 October 2026",
    },
    footer: "Proud Indian · Thank you for your support",
    header: "Donation receipt",
    headerFormat: "DOCUMENT",
    label: "Donation receipt",
    name: "donation_receipt",
  },

  // ── Account ───────────────────────────────────────────────────────────────
  {
    body: "Hi {{name}}, your Proud Indian Dashboard account is ready.\n\nYou can sign in now.",
    category: "UTILITY",
    dashboardPath: "",
    examples: { name: "Priya" },
    header: "Account ready",
    label: "Account ready",
    name: "account_welcome",
  },
  {
    body: "Your role on Proud Indian Dashboard is now {{role}}.\n\nSign in to see what you can do.",
    category: "UTILITY",
    dashboardPath: "",
    examples: { role: "Volunteer" },
    header: "Role changed",
    label: "Role changed",
    name: "account_role_changed",
  },
  {
    body: "Your Proud Indian Dashboard account has been suspended for this reason: {{reason}}.\n\nContact your admin if you have questions.",
    category: "UTILITY",
    examples: { reason: "Repeated missed shifts" },
    header: "Account suspended",
    label: "Account suspended",
    name: "account_suspended",
  },
  {
    body: "Your Proud Indian Dashboard account has been suspended.\n\nContact your admin if you have questions.",
    category: "UTILITY",
    examples: {},
    header: "Account suspended",
    label: "Account suspended",
    name: "account_suspended_no_reason",
  },
  {
    body: "An admin has reactivated your Proud Indian Dashboard account, so your sign-in works again.\n\nIf you didn't expect this, contact your admin.",
    category: "UTILITY",
    dashboardPath: "",
    examples: {},
    header: "Account reactivated",
    label: "Account reactivated",
    name: "account_reactivated",
  },
  {
    body: "Your Proud Indian Dashboard account has been deactivated.\n\nContact your admin if you have questions.",
    category: "UTILITY",
    examples: {},
    header: "Account deactivated",
    label: "Account deactivated",
    name: "account_deactivated",
  },
  {
    body: "An admin reset your Proud Indian Dashboard password.\n\nIf you didn't expect this, contact your admin right away.",
    category: "UTILITY",
    examples: {},
    header: "Password reset",
    label: "Password reset by an admin",
    name: "account_password_reset",
  },
  {
    body: "Your Guardian access to {{edition}} is ready.\n\nYou can now open Kalakriti in Proud Indian Dashboard.",
    category: "UTILITY",
    dashboardPath: "kalakriti/2026",
    examples: { edition: "Kalakriti 2026" },
    header: "Guardian access ready",
    // kalakriti_guardian_access was rejected: its login wording read as
    // authentication, so this is the reworded replacement.
    label: "Kalakriti Guardian access",
    name: "kalakriti_guardian_ready",
  },

  // ── Requests: reimbursements, advance payments, vendor payments ──────────
  {
    body: "A new {{request_type}} is waiting for your review on Proud Indian Dashboard.\n\n*Request:* {{title}}\n*Amount:* {{amount}}\n*Submitted by:* {{submitter}}\n\nPlease approve or reject it when you can.",
    category: "UTILITY",
    dashboardPath: "reimbursements/0192",
    examples: {
      amount: "₹1,250",
      request_type: "reimbursement",
      submitter: "Priya Sharma",
      title: "Snacks for Sunday class",
    },
    header: "Review needed",
    label: "Request awaiting review",
    name: "request_submitted",
  },
  {
    body: "Your {{request_type}} has been approved.\n\n*Request:* {{title}}\n*Amount:* {{amount}}\n\nThe request page has the full details.",
    category: "UTILITY",
    dashboardPath: "reimbursements/0192",
    examples: {
      amount: "₹1,250",
      request_type: "reimbursement",
      title: "Snacks for Sunday class",
    },
    header: "Request approved",
    label: "Request approved",
    name: "request_approved",
  },
  {
    body: "Your {{request_type}} has been approved.\n\n*Request:* {{title}}\n*Amount:* {{amount}}\n*Note from the approver:* {{note}}\n\nThe request page has the full details.",
    category: "UTILITY",
    dashboardPath: "reimbursements/0192",
    examples: {
      amount: "₹1,250",
      note: "Paid to your bank account on file",
      request_type: "reimbursement",
      title: "Snacks for Sunday class",
    },
    header: "Request approved",
    label: "Request approved",
    name: "request_approved_with_note",
  },
  {
    body: "Your {{request_type}} wasn't approved.\n\n*Request:* {{title}}\n*Amount:* {{amount}}\n*Reason:* {{reason}}\n\nThe request page has the full details.",
    category: "UTILITY",
    dashboardPath: "reimbursements/0192",
    examples: {
      amount: "₹1,250",
      reason: "The bill photo is unreadable",
      request_type: "reimbursement",
      title: "Snacks for Sunday class",
    },
    header: "Request not approved",
    label: "Request not approved",
    name: "request_not_approved",
  },
  {
    body: "Some requests submitted to you have been waiting for your approval for 3 days or more.\n\n*Waiting:* {{waiting}}\n\nThe people who submitted them can't be paid until you approve or reject them.",
    category: "UTILITY",
    dashboardPath: "",
    examples: { waiting: "2 reimbursements, 1 vendor payment" },
    header: "Approval needed",
    label: "Requests awaiting approval",
    name: "requests_awaiting_approval",
  },
  {
    body: "A reimbursement has been raised on your behalf.\n\n*Request:* {{title}}\n*Raised by:* {{raised_by}}\n\nIt is yours now, and you will be reimbursed once it is approved.",
    category: "UTILITY",
    dashboardPath: "reimbursements/0192",
    examples: { raised_by: "Anita Rao", title: "Snacks for Sunday class" },
    header: "Reimbursement raised for you",
    label: "Reimbursement raised for you",
    name: "reimbursement_raised_for_you",
  },
  {
    body: "A reimbursement has been moved to you, so you will be reimbursed for it.\n\n*Request:* {{title}}\n*Moved by:* {{changed_by}}\n*Reason:* {{reason}}\n\nThe request page has the full details.",
    category: "UTILITY",
    dashboardPath: "reimbursements/0192",
    examples: {
      changed_by: "Anita Rao",
      reason: "You paid for the snacks",
      title: "Snacks for Sunday class",
    },
    header: "Reimbursement moved to you",
    label: "Reimbursement moved to you",
    name: "reimbursement_now_yours",
  },
  {
    // No button: the previous claimant can no longer open the request.
    body: "A reimbursement that was yours has been moved to someone else.\n\n*Request:* {{title}}\n*Moved to:* {{new_claimant}}\n*Moved by:* {{changed_by}}\n*Reason:* {{reason}}\n\nIt no longer appears in your requests and will not be paid to you.",
    category: "UTILITY",
    examples: {
      changed_by: "Anita Rao",
      new_claimant: "Priya Sharma",
      reason: "Priya paid for the snacks",
      title: "Snacks for Sunday class",
    },
    header: "Reimbursement moved",
    label: "Reimbursement moved to someone else",
    name: "reimbursement_moved_away",
  },

  // ── Vendor payments: invoices and payments ────────────────────────────────
  {
    body: "A new invoice is waiting for your review.\n\n*Vendor payment:* {{title}}\n*Uploaded by:* {{submitter}}\n\nPlease approve or reject it when you can.",
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: { submitter: "Priya Sharma", title: "Bus hire, October" },
    header: "Invoice to review",
    label: "Invoice submitted",
    name: "invoice_submitted",
  },
  {
    body: "A request to close a vendor payment without an invoice is waiting for your review.\n\n*Vendor payment:* {{title}}\n*Requested by:* {{submitter}}\n*Reason:* {{no_invoice_reason}}\n*Proof:* {{proof}}\n\nPlease approve or reject it when you can.",
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: {
      no_invoice_reason: "Vendor doesn't issue invoices",
      proof: "2 proof files",
      submitter: "Priya Sharma",
      title: "Bus hire, October",
    },
    header: "Request to review",
    label: "Payment without invoice submitted",
    name: "no_invoice_submitted",
  },
  {
    body: 'Your invoice for the vendor payment "{{title}}" has been approved.',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: { title: "Bus hire, October" },
    header: "Invoice approved",
    label: "Invoice approved",
    name: "invoice_approved",
  },
  {
    body: "Your invoice for a vendor payment has been approved.\n\n*Vendor payment:* {{title}}\n*Note from the approver:* {{note}}\n\nThe vendor payment page has the full details.",
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: { note: "Filed under transport", title: "Bus hire, October" },
    header: "Invoice approved",
    label: "Invoice approved",
    name: "invoice_approved_with_note",
  },
  {
    body: 'The vendor payment "{{title}}" was approved without an invoice and is now complete.',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: { title: "Bus hire, October" },
    header: "Closed without an invoice",
    label: "Payment without invoice approved",
    name: "no_invoice_approved",
  },
  {
    body: "A vendor payment was approved without an invoice and is now complete.\n\n*Vendor payment:* {{title}}\n*Note from the approver:* {{note}}\n\nThe vendor payment page has the full details.",
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: { note: "Receipt photo accepted", title: "Bus hire, October" },
    header: "Closed without an invoice",
    label: "Payment without invoice approved",
    name: "no_invoice_approved_with_note",
  },
  {
    body: "Your invoice for a vendor payment wasn't approved.\n\n*Vendor payment:* {{title}}\n*Reason:* {{reason}}\n\nThe vendor payment page has the full details.",
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: {
      reason: "The GST number is missing",
      title: "Bus hire, October",
    },
    header: "Invoice not approved",
    label: "Invoice not approved",
    name: "invoice_not_approved",
  },
  {
    body: "Your request to close a vendor payment without an invoice wasn't approved.\n\n*Vendor payment:* {{title}}\n*Reason:* {{reason}}\n\nThe vendor payment page has the full details.",
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: {
      reason: "Please ask the vendor for an invoice",
      title: "Bus hire, October",
    },
    header: "Request not approved",
    label: "Payment without invoice not approved",
    name: "no_invoice_not_approved",
  },
  {
    body: "A new payment is waiting for your review.\n\n*Vendor payment:* {{title}}\n*Amount:* {{amount}}\n*Logged by:* {{submitter}}\n\nPlease approve or reject it when you can.",
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: {
      amount: "₹8,000",
      submitter: "Priya Sharma",
      title: "Bus hire, October",
    },
    header: "Payment to review",
    label: "Vendor payment logged",
    name: "payment_logged",
  },
  {
    body: "A payment you logged has been approved.\n\n*Vendor payment:* {{title}}\n*Amount:* {{amount}}\n\nThe vendor payment page has the full details.",
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: { amount: "₹8,000", title: "Bus hire, October" },
    header: "Payment approved",
    label: "Vendor payment approved",
    name: "payment_approved",
  },
  {
    body: "A payment you logged has been approved.\n\n*Vendor payment:* {{title}}\n*Amount:* {{amount}}\n*Note from the approver:* {{note}}\n\nThe vendor payment page has the full details.",
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: {
      amount: "₹8,000",
      note: "Matched to the bank statement",
      title: "Bus hire, October",
    },
    header: "Payment approved",
    label: "Vendor payment approved",
    name: "payment_approved_with_note",
  },
  {
    body: "A payment you logged wasn't approved.\n\n*Vendor payment:* {{title}}\n*Amount:* {{amount}}\n*Reason:* {{reason}}\n\nThe vendor payment page has the full details.",
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: {
      amount: "₹8,000",
      reason: "The UTR number doesn't match",
      title: "Bus hire, October",
    },
    header: "Payment not approved",
    label: "Vendor payment not approved",
    name: "payment_not_approved",
  },
  {
    body: 'All payments for the vendor payment "{{title}}" are complete.\n\nNothing more is needed from you.',
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: { title: "Bus hire, October" },
    header: "Vendor payment complete",
    label: "Vendor payment complete",
    name: "vendor_payment_complete",
  },
  {
    body: "Pending payments for a vendor payment were rejected automatically.\n\n*Vendor payment:* {{title}}\n*Payments rejected:* {{count}}\n*Reason:* {{reason}}\n\nThe vendor payment page has the full details.",
    category: "UTILITY",
    dashboardPath: "vendor-payments/0192",
    examples: {
      count: "2",
      reason: "The vendor payment was rejected",
      title: "Bus hire, October",
    },
    header: "Payments rejected",
    label: "Payments rejected automatically",
    name: "payments_auto_rejected",
  },
  {
    body: 'Your vendor "{{vendor}}" has been approved.\n\nIt can now be used for payments.',
    category: "UTILITY",
    dashboardPath: "vendors",
    examples: { vendor: "Sri Balaji Travels" },
    header: "Vendor approved",
    label: "Vendor approved",
    name: "vendor_approved",
  },
  {
    body: "Your vendor was approved together with a vendor payment.\n\n*Vendor:* {{vendor}}\n*Vendor payment:* {{title}}\n\nIt can now be used for payments.",
    category: "UTILITY",
    dashboardPath: "vendors",
    examples: { title: "Bus hire, October", vendor: "Sri Balaji Travels" },
    header: "Vendor approved",
    label: "Vendor approved automatically",
    name: "vendor_auto_approved",
  },
  {
    body: 'Your vendor "{{vendor}}" needs changes before it can be approved.\n\nThe vendor page shows what to fix.',
    category: "UTILITY",
    dashboardPath: "vendors",
    examples: { vendor: "Sri Balaji Travels" },
    header: "Vendor needs changes",
    label: "Vendor needs changes",
    name: "vendor_needs_changes",
  },

  // ── Teams ─────────────────────────────────────────────────────────────────
  {
    body: "You've been added to the team {{team}} on Proud Indian Dashboard.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { team: "Sunday Teaching" },
    header: "Added to a team",
    label: "Added to a team",
    name: "team_added",
  },
  {
    body: "You've been moved out of the team {{team}} on Proud Indian Dashboard.",
    category: "UTILITY",
    dashboardPath: "teams",
    examples: { team: "Sunday Teaching" },
    header: "Removed from a team",
    label: "Removed from a team",
    name: "team_removed",
  },
  {
    body: "Your role in one of your teams has changed.\n\n*Team:* {{team}}\n*New role:* {{role}}\n\nOpen the team page to see what's changed.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { role: "lead", team: "Sunday Teaching" },
    header: "Team role changed",
    label: "Team role changed",
    name: "team_role_changed",
  },
  {
    body: "An admin changed the details of your team {{team}}, such as its name or description.\n\nOpen the team page to see the current details.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { team: "Sunday Teaching" },
    header: "Team details changed",
    label: "Team details changed",
    name: "team_details_changed",
  },
  {
    body: "Your team {{team}} has been removed from Proud Indian Dashboard.",
    category: "UTILITY",
    dashboardPath: "teams",
    examples: { team: "Sunday Teaching" },
    header: "Team removed",
    label: "Team deleted",
    name: "team_deleted",
  },

  // ── Events: schedule ──────────────────────────────────────────────────────
  {
    body: "Your team has a new event, {{event}}. It takes place {{details}}.\n\nThe team page has the full details.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { details: EVENT_DETAILS_EXAMPLE, event: "Science Fair" },
    header: "New event",
    label: "New event",
    name: "event_created",
  },
  {
    body: "You've been added to the event {{event}}. It takes place {{details}}.\n\nSee you there.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { details: EVENT_DETAILS_EXAMPLE, event: "Science Fair" },
    header: "Added to an event",
    label: "Added to an event",
    name: "event_added",
  },
  {
    body: "You've been removed from the event {{event}}.\n\nNo action is needed from you.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { event: "Science Fair" },
    header: "Removed from an event",
    label: "Removed from an event",
    name: "event_removed",
  },
  {
    body: "The event {{event}} that you're part of has changed. It now takes place {{details}}.\n\nPlease plan around the new time and place.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { details: EVENT_DETAILS_EXAMPLE, event: "Science Fair" },
    header: "Schedule change",
    label: "Event schedule changed",
    name: "event_schedule_changed",
  },
  {
    body: "The event {{event}} has been cancelled.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { event: "Science Fair" },
    header: "Event cancelled",
    label: "Event cancelled",
    name: "event_cancelled",
  },
  {
    body: "One session of a recurring event has been cancelled.\n\n*Event:* {{event}}\n*Session:* {{when}}\n\nOther sessions go ahead as planned.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { event: "Weekly Science Class", when: "Sat, 18 Oct, 10:00 AM" },
    header: "Session cancelled",
    label: "Event session cancelled",
    name: "event_session_cancelled",
  },
  {
    body: "Upcoming sessions of a recurring event have been cancelled.\n\n*Event:* {{event}}\n*Cancelled from:* {{when}} onwards",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { event: "Weekly Science Class", when: "Sat, 18 Oct, 10:00 AM" },
    header: "Sessions cancelled",
    label: "Event sessions cancelled",
    name: "event_sessions_cancelled_from",
  },
  {
    body: "The upcoming sessions of {{event}} have been cancelled.",
    category: "UTILITY",
    dashboardPath: "teams/0192",
    examples: { event: "Weekly Science Class" },
    header: "Sessions cancelled",
    label: "Upcoming sessions cancelled",
    name: "event_upcoming_sessions_cancelled",
  },
  {
    body: "The event {{event}} that you're part of starts in {{starts_in}}. It takes place {{details}}.\n\nPlease check the event page for any last-minute changes.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: {
      details: EVENT_DETAILS_EXAMPLE,
      event: "Science Fair",
      starts_in: "2 hours",
    },
    header: "Event reminder",
    label: "Event reminder",
    name: "event_reminder",
  },
  {
    body: "An RSVP came in from someone who isn't on the event's team.\n\n*Event:* {{event}}\n*From:* {{voter}}\n*Answer:* {{answer}}\n\nYou can review it on the event page.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: {
      answer: "yes",
      event: "Science Fair",
      voter: "Priya Sharma",
    },
    header: "RSVP from a non-member",
    label: "RSVP from a non-member",
    name: "rsvp_non_member",
  },
  {
    body: "Attendance for {{event}} hasn't been marked yet.\n\nPlease mark it in the dashboard.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair (18 Oct)" },
    header: "Attendance reminder",
    label: "Attendance reminder",
    name: "event_attendance_reminder",
  },

  // ── Events: posted updates ────────────────────────────────────────────────
  {
    body: "There's a new update on an event page.\n\n*Event:* {{event}}\n*Posted by:* {{author}}\n\nOpen the event page to read it.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { author: "Priya Sharma", event: "Science Fair (18 Oct)" },
    header: "New event update",
    label: "Event update posted",
    name: "event_update_posted",
  },
  {
    body: "A post on an event page is waiting for your approval.\n\n*Event:* {{event}}\n*Posted by:* {{author}}\n\nTeam members won't see it until you approve it.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { author: "Priya Sharma", event: "Science Fair (18 Oct)" },
    header: "Approval needed",
    label: "Event update awaiting approval",
    name: "event_post_needs_approval",
  },
  {
    body: "Your post on the event page for {{event}} was approved and is now visible to the team.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair (18 Oct)" },
    header: "Post approved",
    label: "Event update approved",
    name: "event_post_approved",
  },
  {
    body: "Your post on the event page for {{event}} was not approved, so team members won't see it.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair (18 Oct)" },
    header: "Post not approved",
    label: "Event update not approved",
    name: "event_post_not_approved",
  },

  // ── Events: interest ──────────────────────────────────────────────────────
  {
    body: "A volunteer has asked to join an event.\n\n*Event:* {{event}}\n*Volunteer:* {{volunteer}}\n\nPlease review the request.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair", volunteer: "Priya Sharma" },
    header: "Request to join an event",
    label: "Event interest received",
    name: "event_interest_received",
  },
  {
    body: "You've been approved to join the event {{event}}.\n\nThe event page has the full details.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair" },
    header: "Request to join approved",
    label: "Event interest approved",
    name: "event_interest_approved",
  },
  {
    body: "Your request to join {{event}} wasn't approved this time.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair" },
    header: "Request to join not approved",
    label: "Event interest declined",
    name: "event_interest_declined",
  },
  {
    body: "A volunteer has left an event.\n\n*Event:* {{event}}\n*Volunteer:* {{volunteer}}\n\nYou may want to check that the event still has enough volunteers.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair", volunteer: "Priya Sharma" },
    header: "Volunteer left an event",
    label: "Volunteer left an event",
    name: "event_volunteer_left",
  },

  // ── Events: photos ────────────────────────────────────────────────────────
  {
    body: "The photos you uploaded have been reviewed.\n\n*Event:* {{event}}\n*Approved and published:* {{count}}\n\nThey now appear on the event page.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { count: "3", event: "Science Fair" },
    header: "Photos approved",
    label: "Photos approved",
    name: "photos_approved",
  },
  {
    body: "The photos you uploaded have been reviewed.\n\n*Event:* {{event}}\n*Not published:* {{count}}\n\nThese photos won't appear on the event page.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { count: "1", event: "Science Fair" },
    header: "Photos not published",
    label: "Photos not published",
    name: "photos_not_published",
  },
  {
    body: "Photos uploaded by volunteers are waiting for your approval.\n\n*Waiting:* {{photos}} across {{events}}\n\nThey won't appear on the event pages until you approve them.",
    category: "UTILITY",
    dashboardPath: "events",
    examples: { events: "2 events", photos: "14 photos" },
    header: "Photos awaiting approval",
    label: "Photos awaiting approval",
    name: "photos_need_approval",
  },
  {
    body: "You took part in {{event}}.\n\nIf you have photos from it, you can upload them to the event page.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair" },
    header: "Event photos",
    label: "Photo upload request",
    name: "photos_upload_request",
  },

  // ── Events: feedback ──────────────────────────────────────────────────────
  {
    body: "Anonymous feedback is open for {{event}}, which you took part in.\n\nYou can share it from the event page.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair" },
    header: "Feedback open",
    label: "Feedback open",
    name: "feedback_open",
  },
  {
    body: "Feedback for {{event}}, which you took part in, closes tomorrow.\n\nIt's anonymous.",
    category: "UTILITY",
    dashboardPath: "events/0192",
    examples: { event: "Science Fair" },
    header: "Feedback closes tomorrow",
    label: "Feedback closing soon",
    name: "feedback_closing",
  },

  // ── Kalakriti ─────────────────────────────────────────────────────────────
  {
    body: "Registration for {{edition}} is {{status}}.\n\nOpen Kalakriti for details.",
    category: "UTILITY",
    dashboardPath: "kalakriti/2026",
    examples: { edition: "Kalakriti 2026", status: "now open" },
    header: "Kalakriti registration",
    label: "Kalakriti registration",
    name: "kalakriti_registration",
  },
  {
    body: "The schedule for {{edition}} has changed.\n\nPlease check the latest schedule.",
    category: "UTILITY",
    dashboardPath: "kalakriti/2026/schedule",
    examples: { edition: "Kalakriti 2026" },
    header: "Schedule change",
    label: "Kalakriti schedule changed",
    name: "kalakriti_schedule_changed",
  },
  {
    body: "Transport details for your Center in {{edition}} have changed.\n\nPlease check the bus and driver details.",
    category: "UTILITY",
    dashboardPath: "kalakriti/2026/centers?centerId=0192",
    examples: { edition: "Kalakriti 2026" },
    header: "Transport change",
    label: "Kalakriti transport changed",
    name: "kalakriti_transport_changed",
  },
  {
    body: "An administrator has reactivated your Guardian access for {{edition}}.\n\nIf you didn't expect this, contact your administrator.",
    category: "UTILITY",
    dashboardPath: "kalakriti/2026",
    examples: { edition: "Kalakriti 2026" },
    header: "Guardian access restored",
    label: "Kalakriti Guardian access restored",
    name: "kalakriti_guardian_reactivated",
  },

  // ── WhatsApp groups ───────────────────────────────────────────────────────
  {
    body: "You've been added to {{joined}}.\n\nJoin its WhatsApp group, {{group}}, for updates and plans.",
    category: "UTILITY",
    examples: {
      group: "Sunday Teaching Volunteers",
      joined: "the team Sunday Teaching",
    },
    buttonText: "Join group",
    // Meta doesn't allow chat.whatsapp.com links in buttons, so the button
    // opens a dashboard page that redirects to the group's invite link.
    dashboardPath: "whatsapp-groups/0192/join",
    header: "WhatsApp group invite",
    label: "WhatsApp group invite",
    name: "group_invite",
  },
  {
    body: "You haven't joined a WhatsApp group you were invited to yet.\n\n*Group:* {{group}}\n*Join by:* {{date}}\n\nJoin it by then to keep your Proud Indian Dashboard account active.",
    category: "UTILITY",
    examples: { date: "Wed, 18 Nov", group: "Proud Indian Volunteers" },
    buttonText: "Join group",
    dashboardPath: "whatsapp-groups/0192/join",
    header: "WhatsApp group reminder",
    label: "WhatsApp group join reminder",
    name: "group_join_reminder",
  },

  // ── Digests ───────────────────────────────────────────────────────────────
  {
    body: "Here is a summary of {{count}} notifications about your account in {{topic}}.\n\n*Notifications:* {{summary}}\n\nEach one is listed in your dashboard notifications.",
    category: "UTILITY",
    dashboardPath: "reimbursements",
    examples: {
      count: "3",
      summary:
        'Reimbursement "Snacks" approved; Reimbursement "Auto fare" approved; Advance payment "Art supplies" not approved',
      topic: "Approvals and rejections",
    },
    header: "Notification summary",
    label: "Notification summary",
    name: "notifications_summary",
  },
  {
    body: "Today's social media posts are ready for your approval.\n\n*Posts:* {{summary}}\n\nPlease approve or reject them when you can.",
    category: "UTILITY",
    dashboardPath: "social",
    examples: {
      summary: "Schedule post for Science Fair; Recap of Sunday class",
    },
    header: "Social posts to approve",
    label: "Social posts for approval",
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
  | { format: "TEXT"; text: string; type: "HEADER" }
  | {
      example?: { header_handle: string[] };
      format: "DOCUMENT";
      type: "HEADER";
    }
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

/**
 * The body Meta's `POST /{waba-id}/message_templates` expects. Its
 * `components` are also what `POST /{template-id}` takes to edit one.
 */
export function toTemplatePayload(
  template: WhatsAppTemplate,
  appUrl: string,
  documentHeaderHandle?: string
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
      ...(template.header === undefined
        ? []
        : template.headerFormat === "DOCUMENT"
          ? [
              {
                ...(documentHeaderHandle
                  ? { example: { header_handle: [documentHeaderHandle] } }
                  : {}),
                format: "DOCUMENT" as const,
                type: "HEADER" as const,
              },
            ]
          : [
              {
                format: "TEXT" as const,
                text: template.header,
                type: "HEADER" as const,
              },
            ]),
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
      { text: template.footer ?? TEMPLATE_FOOTER, type: "FOOTER" },
      ...(buttons.length > 0 ? [{ buttons, type: "BUTTONS" as const }] : []),
    ],
    language: TEMPLATE_LANGUAGE,
    name: template.name,
    parameter_format: "named",
  };
}
