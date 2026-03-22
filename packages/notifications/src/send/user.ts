import { env } from "@pi-dash/env/server";
import { sendMessage } from "../send-message";
import { TOPICS } from "../topics";

interface WelcomeOptions {
  name: string;
  userId: string;
}

interface RoleChangedOptions {
  newRole: string;
  userId: string;
}

interface BannedOptions {
  reason?: string;
  userId: string;
}

interface UnbannedOptions {
  userId: string;
}

export async function notifyUserWelcome({
  userId,
  name,
}: WelcomeOptions): Promise<void> {
  await sendMessage({
    to: userId,
    title: `Welcome to ${env.APP_NAME}!`,
    body: `Hi ${name}, your account has been created. Get started by exploring the dashboard.`,
    clickAction: "/",
    idempotencyKey: `user-welcome-${userId}`,
    topic: TOPICS.ACCOUNT,
  });
}

export async function notifyRoleChanged({
  userId,
  newRole,
}: RoleChangedOptions): Promise<void> {
  await sendMessage({
    to: userId,
    title: "Role Updated",
    body: `Your role has been changed to ${newRole}.`,
    clickAction: "/",
    idempotencyKey: `role-changed-${userId}-${newRole}`,
    topic: TOPICS.ACCOUNT,
  });
}

export async function notifyUserBanned({
  userId,
  reason,
}: BannedOptions): Promise<void> {
  await sendMessage({
    to: userId,
    title: "Account Suspended",
    body: reason
      ? `Your account has been suspended: ${reason}`
      : "Your account has been suspended.",
    idempotencyKey: `user-banned-${userId}`,
    topic: TOPICS.ACCOUNT,
  });
}

export async function notifyUserUnbanned({
  userId,
}: UnbannedOptions): Promise<void> {
  await sendMessage({
    to: userId,
    title: "Account Restored",
    body: "Your account has been restored. You can now access the platform.",
    clickAction: "/",
    idempotencyKey: `user-unbanned-${userId}`,
    topic: TOPICS.ACCOUNT,
  });
}
