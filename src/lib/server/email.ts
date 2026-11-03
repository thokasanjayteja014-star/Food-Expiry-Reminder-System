/**
 * Reminder emails through Brevo (free plan: 300 emails a day, needs only an API key), or
 * any SMTP account such as Gmail with an app password. Emails only go to the account's
 * own, verified sign-in address.
 */
import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { adminAuth } from "./firebaseAdmin";

function brevoEnabled(): boolean {
  return Boolean(process.env.BREVO_API_KEY);
}

export function isEmailConfigured(): boolean {
  if (brevoEnabled()) return Boolean(process.env.EMAIL_FROM);
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

/** "Name <address>" or a bare address, from EMAIL_FROM. */
function sender(): { name: string; email: string } {
  const raw = (process.env.EMAIL_FROM || process.env.SMTP_USER || "").trim();
  const m = /^(.*)<([^>]+)>$/.exec(raw);
  return m ? { name: m[1]!.trim() || "Food Expiry Reminder", email: m[2]!.trim() } : { name: "Food Expiry Reminder", email: raw };
}

async function sendWithBrevo(to: string, subject: string, html: string): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": process.env.BREVO_API_KEY!, accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ sender: sender(), to: [{ email: to }], subject, htmlContent: html }),
      signal: controller.signal,
    });
    if (!res.ok) {
      // Brevo explains the problem (bad key, sender not verified) in the body; it holds no secrets.
      const detail = await res.text().catch(() => "");
      throw new Error(`Brevo returned ${res.status}: ${detail.slice(0, 200)}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

let transporter: Transporter | null = null;
function getTransporter(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS! },
    });
  }
  return transporter;
}

/** Public address of the app, for links in emails. */
export function appUrl(fallback?: string): string {
  const url =
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "") ||
    fallback ||
    "";
  return url.replace(/\/$/, "");
}

export async function sendEmail(to: string, subject: string, text: string, html: string): Promise<void> {
  if (brevoEnabled()) return sendWithBrevo(to, subject, html);
  const { name, email } = sender();
  await getTransporter().sendMail({ from: { name, address: email }, to, subject, text, html });
}

/** The user's sign-in email and whether it is verified (Google accounts always are). */
export async function accountEmail(uid: string): Promise<{ email: string | null; verified: boolean }> {
  const user = await adminAuth().getUser(uid);
  return { email: user.email ?? null, verified: Boolean(user.emailVerified) };
}

/** Sends a Firebase email-verification link through our own SMTP account. */
export async function sendVerificationEmail(email: string, continueUrl?: string): Promise<void> {
  const link = await adminAuth().generateEmailVerificationLink(email, continueUrl ? { url: continueUrl } : undefined);
  await sendEmail(
    email,
    "Verify your email for Food Expiry Reminder",
    `Open this link to verify your email and start getting expiry reminders:\n${link}`,
    `<p>Tap the button to verify your email and start getting expiry reminders.</p>
     <p><a href="${escapeHtml(link)}" style="display:inline-block;padding:10px 16px;background:#15803d;color:#fff;border-radius:8px;text-decoration:none">Verify email</a></p>`,
  );
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export interface EmailReminder {
  title: string;
  message: string;
  url: string;
}

/** One daily digest listing every reminder due today. */
export function reminderDigest(name: string, reminders: EmailReminder[], baseUrl: string) {
  const subject =
    reminders.length === 1 ? `🔔 ${reminders[0]!.message}` : `🔔 ${reminders.length} products need your attention`;
  const link = (path: string) => (baseUrl ? `${baseUrl}${path}` : "");
  const text = [
    `Hi ${name || "there"},`,
    "",
    ...reminders.map((r) => `- ${r.message}${link(r.url) ? `  ${link(r.url)}` : ""}`),
    "",
    "You get this email because email reminders are on in Profile & settings.",
  ].join("\n");
  const rows = reminders
    .map(
      (r) =>
        `<li style="margin:6px 0">${link(r.url) ? `<a href="${escapeHtml(link(r.url))}">${escapeHtml(r.message)}</a>` : escapeHtml(r.message)}</li>`,
    )
    .join("");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111">
    <p>Hi ${escapeHtml(name || "there")},</p>
    <ul style="padding-left:18px">${rows}</ul>
    ${baseUrl ? `<p><a href="${escapeHtml(link("/notifications"))}">Open Food Expiry Reminder</a></p>` : ""}
    <p style="color:#666;font-size:12px">You get this email because email reminders are on in Profile &amp; settings.</p>
  </div>`;
  return { subject, text, html };
}
