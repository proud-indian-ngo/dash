import { renderNotificationEmail } from "@pi-dash/email";
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
  const emailHtml = await renderNotificationEmail({
    heading: `Welcome to ${env.APP_NAME}!`,
    paragraphs: [
      `Hi ${name}, your account has been created. Get started by exploring the dashboard.`,
    ],
    ctaUrl: `${env.APP_URL}/`,
    ctaLabel: "Go to Dashboard",
  });
  await sendMessage({
    to: userId,
    title: `Welcome to ${env.APP_NAME}!`,
    body: `Hi ${name}, your account has been created. Get started by exploring the dashboard.`,
    emailHtml,
    clickAction: "/",
    idempotencyKey: `user-welcome-${userId}`,
    topic: TOPICS.ACCOUNT,
  });
}

export async function notifyRoleChanged({
  userId,
  newRole,
}: RoleChangedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "Role Updated",
    paragraphs: [`Your role has been changed to ${newRole}.`],
    ctaUrl: `${env.APP_URL}/`,
    ctaLabel: "Go to Dashboard",
  });
  await sendMessage({
    to: userId,
    title: "Role Updated",
    body: `Your role has been changed to ${newRole}.`,
    emailHtml,
    clickAction: "/",
    idempotencyKey: `role-changed-${userId}-${newRole}`,
    topic: TOPICS.ACCOUNT,
  });
}

export async function notifyUserBanned({
  userId,
  reason,
}: BannedOptions): Promise<void> {
  const body = reason
    ? `Your account has been suspended: ${reason}`
    : "Your account has been suspended.";
  const emailHtml = await renderNotificationEmail({
    heading: "Account Suspended",
    paragraphs: [body],
  });
  await sendMessage({
    to: userId,
    title: "Account Suspended",
    body,
    emailHtml,
    idempotencyKey: `user-banned-${userId}`,
    topic: TOPICS.ACCOUNT,
  });
}

export async function notifyUserUnbanned({
  userId,
}: UnbannedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "Account Restored",
    paragraphs: [
      "Your account has been restored. You can now access the platform.",
    ],
    ctaUrl: `${env.APP_URL}/`,
    ctaLabel: "Go to Dashboard",
  });
  await sendMessage({
    to: userId,
    title: "Account Restored",
    body: "Your account has been restored. You can now access the platform.",
    emailHtml,
    clickAction: "/",
    idempotencyKey: `user-unbanned-${userId}`,
    topic: TOPICS.ACCOUNT,
  });
}

interface PasswordResetOptions {
  userId: string;
}

interface UserDeactivatedOptions {
  userId: string;
}

interface UserDeletedOptions {
  userId: string;
}

interface UserReactivatedOptions {
  userId: string;
}

export async function notifyPasswordReset({
  userId,
}: PasswordResetOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "Password Reset by Admin",
    paragraphs: [
      "Your password has been reset by an administrator. If this was unexpected, contact your admin immediately.",
    ],
  });
  await sendMessage({
    to: userId,
    title: "Password Reset by Admin",
    body: "Your password has been reset by an administrator. If this was unexpected, contact your admin immediately.",
    emailHtml,
    idempotencyKey: `password-reset-admin-${userId}`,
    topic: TOPICS.ACCOUNT,
  });
}

export async function notifyUserDeactivated({
  userId,
}: UserDeactivatedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "Account Deactivated",
    paragraphs: [
      "Your account has been deactivated. Contact your administrator for more information.",
    ],
  });
  await sendMessage({
    to: userId,
    title: "Account Deactivated",
    body: "Your account has been deactivated. Contact your administrator for more information.",
    emailHtml,
    idempotencyKey: `user-deactivated-${userId}`,
    topic: TOPICS.ACCOUNT,
  });
}

export async function notifyUserDeleted({
  userId,
}: UserDeletedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "Account Deleted",
    paragraphs: [
      "Your account is being deleted by an administrator. All your data will be removed.",
    ],
  });
  await sendMessage({
    to: userId,
    title: "Account Deleted",
    body: "Your account is being deleted by an administrator. All your data will be removed.",
    emailHtml,
    idempotencyKey: `user-deleted-${userId}`,
    topic: TOPICS.ACCOUNT,
  });
}

export async function notifyUserReactivated({
  userId,
}: UserReactivatedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "Account Reactivated",
    paragraphs: [
      "Your account has been reactivated. You can now access the platform.",
    ],
    ctaUrl: `${env.APP_URL}/`,
    ctaLabel: "Go to Dashboard",
  });
  await sendMessage({
    to: userId,
    title: "Account Reactivated",
    body: "Your account has been reactivated. You can now access the platform.",
    emailHtml,
    clickAction: "/",
    idempotencyKey: `user-reactivated-${userId}`,
    topic: TOPICS.ACCOUNT,
  });
}
