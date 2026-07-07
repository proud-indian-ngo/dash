import { env } from "@pi-dash/env/server";
import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  auth: { pass: env.SMTP_PASS, user: env.SMTP_USER },
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
});
