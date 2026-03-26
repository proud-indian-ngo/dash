import type { PermissionId } from "@pi-dash/db/permissions";

export const TOPICS = {
  ACCOUNT: "Account Notifications",
  REQUESTS_SUBMISSIONS: "Requests - New Submissions",
  REQUESTS_STATUS: "Requests - Approvals & Rejections",
  TEAMS: "Teams",
  EVENTS_SCHEDULE: "Events - Schedule",
  EVENTS_INTEREST: "Events - Interest",
  EVENTS_PHOTOS: "Events - Photos",
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];

export interface TopicMeta {
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
    id: TOPICS.ACCOUNT,
    name: "Account",
    description: "Welcome messages, role changes, and account status updates.",
    group: "Account",
    required: true,
    defaultEnabled: true,
  },
  {
    id: TOPICS.REQUESTS_SUBMISSIONS,
    name: "Pending Approvals",
    description:
      "Notifications when new requests are submitted for your approval.",
    group: "Requests",
    required: false,
    defaultEnabled: true,
    requiredPermission: "requests.approve",
  },
  {
    id: TOPICS.REQUESTS_STATUS,
    name: "Approvals & Rejections",
    description: "Status updates when your requests are approved or rejected.",
    group: "Requests",
    required: false,
    defaultEnabled: true,
    requiredPermission: "requests.create",
  },
  {
    id: TOPICS.TEAMS,
    name: "Teams",
    description: "Team updates and membership changes.",
    group: "Teams",
    required: false,
    defaultEnabled: true,
    requiredPermission: "teams.view_own",
  },
  {
    id: TOPICS.EVENTS_SCHEDULE,
    name: "Schedule",
    description:
      "Event creation, updates, cancellations, membership, and posted updates.",
    group: "Events",
    required: false,
    defaultEnabled: true,
    requiredPermission: "events.view_own",
  },
  {
    id: TOPICS.EVENTS_INTEREST,
    name: "Interest",
    description: "Interest requests received, approved, or declined.",
    group: "Events",
    required: false,
    defaultEnabled: true,
    requiredPermission: "events.view_own",
  },
  {
    id: TOPICS.EVENTS_PHOTOS,
    name: "Photos",
    description: "Notifications when your uploaded photos are reviewed.",
    group: "Events",
    required: false,
    defaultEnabled: true,
    requiredPermission: "events.view_own",
  },
];
