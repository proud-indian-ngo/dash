export const TOPICS = {
  GENERAL: "General Notifications",
  ACCOUNT: "Account Notifications",
} as const;

export type Topic = (typeof TOPICS)[keyof typeof TOPICS];
