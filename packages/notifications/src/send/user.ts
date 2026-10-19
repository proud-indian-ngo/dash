import { getEmailSuppression } from "@pi-dash/db/queries/email-suppression";
import { renderNotificationEmail } from "@pi-dash/email";
import { env } from "@pi-dash/env/server";
import { whatsappTemplate } from "@pi-dash/whatsapp/template-message";

import { sendNotificationEmail } from "../email";
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
    whatsappTemplate: whatsappTemplate(
      "kalakriti_guardian_ready",
      { edition: editionName },
      path
    ),
  });
}

interface RoleChangedOptions {
  changedAt: number;
  newRole: string;
  userId: string;
}

interface BannedOptions {
  bannedAt: number;
  reason?: string;
  userId: string;
}

interface UnbannedOptions {
  unbannedAt: number;
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
    whatsappTemplate: whatsappTemplate("account_welcome", { name }),
  });
}

export async function notifyRoleChanged({
  changedAt,
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
    idempotencyKey: `role-changed-${userId}-${newRole}-${changedAt}`,
    title: "🔑 New role for you",
    to: userId,
    topic: TOPICS.ACCOUNT,
    whatsappTemplate: whatsappTemplate("account_role_changed", {
      role: newRole,
    }),
  });
}

export async function notifyUserBanned({
  bannedAt,
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
    idempotencyKey: `user-banned-${userId}-${bannedAt}`,
    title: "⚠️ Account suspended",
    to: userId,
    topic: TOPICS.ACCOUNT,
    whatsappTemplate: reason
      ? whatsappTemplate("account_suspended", { reason })
      : whatsappTemplate("account_suspended_no_reason", {}),
  });
}

export async function notifyUserUnbanned({
  unbannedAt,
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
    idempotencyKey: `user-unbanned-${userId}-${unbannedAt}`,
    title: "🎉 Welcome back!",
    to: userId,
    topic: TOPICS.ACCOUNT,
    whatsappTemplate: whatsappTemplate("account_reactivated", {}),
  });
}

interface PasswordResetOptions {
  resetAt: number;
  userId: string;
}

interface UserDeactivatedOptions {
  userId: string;
}

interface PrepareUserDeletedEmailOptions {
  toEmail: string;
}

export interface PreparedUserDeletedEmail {
  emailHtml: string;
  toEmail: string;
}

interface UserReactivatedOptions {
  userId: string;
}

export async function notifyPasswordReset({
  resetAt,
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
    idempotencyKey: `password-reset-admin-${userId}-${resetAt}`,
    title: "🔒 Password reset",
    to: userId,
    topic: TOPICS.ACCOUNT,
    whatsappTemplate: whatsappTemplate("account_password_reset", {}),
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
    whatsappTemplate: whatsappTemplate("account_deactivated", {}),
  });
}

export async function prepareUserDeletedEmail({
  toEmail,
}: PrepareUserDeletedEmailOptions): Promise<PreparedUserDeletedEmail> {
  const emailHtml = await renderNotificationEmail({
    heading: "Account deleted",
    paragraphs: ["Your account has been removed by an admin."],
  });
  return { emailHtml, toEmail };
}

export async function sendUserDeletedEmail({
  emailHtml,
  toEmail,
}: PreparedUserDeletedEmail): Promise<void> {
  // The user row is gone, so check the suppression list directly.
  if (await getEmailSuppression(toEmail)) {
    return;
  }
  await sendNotificationEmail({
    body: "Your account has been removed by an admin.",
    emailHtml,
    title: "⚠️ Account deleted",
    toEmail,
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
    whatsappTemplate: whatsappTemplate("account_reactivated", {}),
  });
}
