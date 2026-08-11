import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { sendMessage } from "../send-message";
import { TOPICS } from "../topics";

interface WelcomeOptions {
  name: string;
  userId: string;
}

interface KalakritiGuardianAccessOptions {
  editionName: string;
  membershipId: string;
  reusedIdentity: boolean;
  userId: string;
  year: number;
}

export async function notifyKalakritiGuardianAccess({
  editionName,
  membershipId,
  reusedIdentity,
  userId,
  year,
}: KalakritiGuardianAccessOptions): Promise<void> {
  const path = `/kalakriti/${year}`;
  const body = reusedIdentity
    ? `Your Guardian access to ${editionName} is active. Your existing login credentials remain unchanged.`
    : `Your Guardian access to ${editionName} is ready. Use the login credentials provided by your administrator.`;
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Open Kalakriti",
    ctaUrl: `${env.APP_URL}${path}`,
    heading: `Guardian access for ${editionName}`,
    paragraphs: [body],
  });
  await sendMessage({
    body,
    clickAction: path,
    emailHtml,
    idempotencyKey: `kalakriti-guardian-access-${membershipId}`,
    title: `Guardian access for ${editionName}`,
    to: userId,
    topic: TOPICS.ACCOUNT,
  });
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
    ctaLabel: "Let's go",
    ctaUrl: `${env.APP_URL}/`,
    heading: "Welcome aboard!",
    paragraphs: [
      `Hey ${name}, welcome to the team! Your account is all set up and ready to go.`,
    ],
  });
  await sendMessage({
    body: `Hey ${name}, welcome to the team! Your account is all set up and ready to go.`,
    clickAction: "/",
    emailHtml,
    idempotencyKey: `user-welcome-${userId}`,
    title: "🎉 Welcome aboard!",
    to: userId,
    topic: TOPICS.ACCOUNT,
  });
}

export async function notifyRoleChanged({
  userId,
  newRole,
}: RoleChangedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Let's go",
    ctaUrl: `${env.APP_URL}/`,
    heading: "New role for you",
    paragraphs: [`Heads up — you're now a ${newRole}!`],
  });
  await sendMessage({
    body: `Heads up — you're now a ${newRole}!`,
    clickAction: "/",
    emailHtml,
    idempotencyKey: `role-changed-${userId}-${newRole}`,
    title: "🔑 New role for you",
    to: userId,
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
    body,
    emailHtml,
    idempotencyKey: `user-banned-${userId}`,
    title: "⚠️ Account suspended",
    to: userId,
    topic: TOPICS.ACCOUNT,
  });
}

export async function notifyUserUnbanned({
  userId,
}: UnbannedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Jump back in",
    ctaUrl: `${env.APP_URL}/`,
    heading: "Welcome back!",
    paragraphs: [
      "Great news — your account is back! Jump in whenever you're ready.",
    ],
  });
  await sendMessage({
    body: "Great news — your account is back! Jump in whenever you're ready.",
    clickAction: "/",
    emailHtml,
    idempotencyKey: `user-unbanned-${userId}`,
    title: "🎉 Welcome back!",
    to: userId,
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
    body: "Your password was reset by an admin. If this wasn't you, reach out to your admin right away.",
    emailHtml,
    idempotencyKey: `password-reset-admin-${userId}`,
    title: "🔒 Password reset",
    to: userId,
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
    body: "Your account has been deactivated. Reach out to your admin if you have questions.",
    emailHtml,
    idempotencyKey: `user-deactivated-${userId}`,
    title: "⚠️ Account deactivated",
    to: userId,
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
    body: "Your account is being removed by an admin. All your data will be deleted.",
    emailHtml,
    idempotencyKey: `user-deleted-${userId}`,
    title: "⚠️ Account deleted",
    to: userId,
    topic: TOPICS.ACCOUNT,
  });
}

export async function notifyUserReactivated({
  userId,
}: UserReactivatedOptions): Promise<void> {
  const emailHtml = await renderNotificationEmail({
    ctaLabel: "Jump back in",
    ctaUrl: `${env.APP_URL}/`,
    heading: "You're back!",
    paragraphs: ["Your account is active again — welcome back!"],
  });
  await sendMessage({
    body: "Your account is active again — welcome back!",
    clickAction: "/",
    emailHtml,
    idempotencyKey: `user-reactivated-${userId}`,
    title: "🎉 You're back!",
    to: userId,
    topic: TOPICS.ACCOUNT,
  });
}
