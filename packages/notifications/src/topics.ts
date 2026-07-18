import type { PermissionId } from "@pi-dash/db/permissions";

export const NOTIFICATION_CHANNELS = ["inbox", "email", "whatsapp"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const TOPICS = {
  ACCOUNT: "Account Notifications",
  EVENTS_FEEDBACK: "Events - Feedback",
  EVENTS_INTEREST: "Events - Interest",
  EVENTS_PHOTOS: "Events - Photos",
  EVENTS_SCHEDULE: "Events - Schedule",
  KALAKRITI_REGISTRATION: "Kalakriti - Registration",
  KALAKRITI_SCHEDULE: "Kalakriti - Schedule",
  REQUESTS_STATUS: "Requests - Approvals & Rejections",
  REQUESTS_SUBMISSIONS: "Requests - New Submissions",
  TEAMS: "Teams",
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

export interface TopicMeta {
  channels?: readonly NotificationChannel[];
  defaultEnabled: boolean;
  description: string;
  group: string;
  id: Topic;
  name: string;
  required: boolean;
  requiredPermission?: PermissionId;
}

export const TOPIC_CATALOG: TopicMeta[] = [
  {
    channels: ["inbox", "whatsapp"],
    defaultEnabled: true,
    description: "Registration opening, closing, and Guardian access updates.",
    group: "Kalakriti",
    id: TOPICS.KALAKRITI_REGISTRATION,
    name: "Registration",
    required: false,
    requiredPermission: "kalakriti.view",
  },
  {
    channels: ["inbox", "whatsapp"],
    defaultEnabled: true,
    description: "Changes to the public competition schedule.",
    group: "Kalakriti",
    id: TOPICS.KALAKRITI_SCHEDULE,
    name: "Schedule",
    required: false,
    requiredPermission: "kalakriti.view",
  },
  {
    defaultEnabled: true,
    description: "Welcome messages, role changes, and account status updates.",
    group: "Account",
    id: TOPICS.ACCOUNT,
    name: "Account",
    required: true,
  },
  {
    defaultEnabled: true,
    description:
      "Notifications when new requests are submitted for your approval.",
    group: "Requests",
    id: TOPICS.REQUESTS_SUBMISSIONS,
    name: "Pending Approvals",
    required: false,
    requiredPermission: "requests.approve",
  },
  {
    defaultEnabled: true,
    description: "Status updates when your requests are approved or rejected.",
    group: "Requests",
    id: TOPICS.REQUESTS_STATUS,
    name: "Approvals & Rejections",
    required: false,
    requiredPermission: "requests.create",
  },
  {
    defaultEnabled: true,
    description: "Team updates and membership changes.",
    group: "Teams",
    id: TOPICS.TEAMS,
    name: "Teams",
    required: false,
    requiredPermission: "teams.view_own",
  },
  {
    defaultEnabled: true,
    description:
      "Event creation, updates, cancellations, membership, and posted updates.",
    group: "Events",
    id: TOPICS.EVENTS_SCHEDULE,
    name: "Schedule",
    required: false,
    requiredPermission: "events.view_own",
  },
  {
    defaultEnabled: true,
    description: "Interest requests received, approved, or declined.",
    group: "Events",
    id: TOPICS.EVENTS_INTEREST,
    name: "Interest",
    required: false,
    requiredPermission: "events.view_own",
  },
  {
    defaultEnabled: true,
    description: "Notifications when your uploaded photos are reviewed.",
    group: "Events",
    id: TOPICS.EVENTS_PHOTOS,
    name: "Photos",
    required: false,
    requiredPermission: "events.view_own",
  },
  {
    defaultEnabled: true,
    description:
      "Notifications when event feedback is open for your participation.",
    group: "Events",
    id: TOPICS.EVENTS_FEEDBACK,
    name: "Feedback",
    required: false,
    requiredPermission: "events.view_own",
  },
];
