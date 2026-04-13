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
    heading: "Welcome aboard!",
    paragraphs: [
      `Hey ${name}, welcome to the team! Your account is all set up and ready to go.`,
    ],
    ctaUrl: `${env.APP_URL}/`,
    ctaLabel: "Let's go",
  });
  await sendMessage({
    to: userId,
    title: "🎉 Welcome aboard!",
    body: `Hey ${name}, welcome to the team! Your account is all set up and ready to go.`,
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
    heading: "New role for you",
    paragraphs: [`Heads up — you're now a ${newRole}!`],
    ctaUrl: `${env.APP_URL}/`,
    ctaLabel: "Let's go",
  });
  await sendMessage({
    to: userId,
    title: "🔑 New role for you",
    body: `Heads up — you're now a ${newRole}!`,
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
    heading: "Account suspended",
    paragraphs: [body],
  });
  await sendMessage({
    to: userId,
    title: "⚠️ Account suspended",
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
    heading: "Welcome back!",
    paragraphs: [
      "Great news — your account is back! Jump in whenever you're ready.",
    ],
    ctaUrl: `${env.APP_URL}/`,
    ctaLabel: "Jump back in",
  });
  await sendMessage({
    to: userId,
    title: "🎉 Welcome back!",
    body: "Great news — your account is back! Jump in whenever you're ready.",
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
    heading: "Password reset",
    paragraphs: [
      "Your password was reset by an admin. If this wasn't you, reach out to your admin right away.",
    ],
  });
  await sendMessage({
    to: userId,
    title: "🔒 Password reset",
    body: "Your password was reset by an admin. If this wasn't you, reach out to your admin right away.",
    emailHtml,
    idempotencyKey: `password-reset-admin-${userId}`,
    topic: TOPICS.ACCOUNT,
  });
}

export async function notifyUserDeactivated({
  userId,
}: UserDeactivatedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "Account deactivated",
    paragraphs: [
      "Your account has been deactivated. Reach out to your admin if you have questions.",
    ],
  });
  await sendMessage({
    to: userId,
    title: "⚠️ Account deactivated",
    body: "Your account has been deactivated. Reach out to your admin if you have questions.",
    emailHtml,
    idempotencyKey: `user-deactivated-${userId}`,
    topic: TOPICS.ACCOUNT,
  });
}

export async function notifyUserDeleted({
  userId,
}: UserDeletedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "Account deleted",
    paragraphs: [
      "Your account is being removed by an admin. All your data will be deleted.",
    ],
  });
  await sendMessage({
    to: userId,
    title: "⚠️ Account deleted",
    body: "Your account is being removed by an admin. All your data will be deleted.",
    emailHtml,
    idempotencyKey: `user-deleted-${userId}`,
    topic: TOPICS.ACCOUNT,
  });
}

export async function notifyUserReactivated({
  userId,
}: UserReactivatedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    heading: "You're back!",
    paragraphs: ["Your account is active again — welcome back!"],
    ctaUrl: `${env.APP_URL}/`,
    ctaLabel: "Jump back in",
  });
  await sendMessage({
    to: userId,
    title: "🎉 You're back!",
    body: "Your account is active again — welcome back!",
    emailHtml,
    clickAction: "/",
    idempotencyKey: `user-reactivated-${userId}`,
    topic: TOPICS.ACCOUNT,
  });
}
