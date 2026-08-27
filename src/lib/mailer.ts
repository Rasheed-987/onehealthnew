import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outbound email.
 *
 * Two transports, chosen by whether SMTP is configured:
 *
 *   SMTP_HOST set  -> real delivery through that server
 *   not set        -> the message is written to the server console
 *
 * The console transport is not a stub to be replaced later; it is what makes
 * the invitation flow testable before anyone has bought a domain or verified a
 * sender. It prints the link so a developer can click it. It refuses to run
 * outside development, because silently "sending" a password reset in
 * production would be far worse than failing loudly.
 */

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

let cached: Transporter | null = null;

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

function getTransport(): Transporter {
  if (cached) return cached;
  cached = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    // Port 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  return cached;
}

export function mailFrom(): string {
  return (
    process.env.MAIL_FROM ?? "Letters and Numbers <no-reply@lettersandnumbers.local>"
  );
}

/**
 * The base the emailed links are built on.
 *
 * A link is useless if it points at the wrong host, and `request.url` cannot
 * be trusted for this - an attacker-supplied Host header would rewrite every
 * invitation to their own domain. So it comes from configuration only.
 */
export function appUrl(): string {
  const url = process.env.APP_URL?.trim() || "http://localhost:3000";
  return url.replace(/\/+$/, "");
}

export async function sendMail(mail: Mail): Promise<void> {
  if (!smtpConfigured()) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SMTP_HOST is not set, so no email can be sent. Configure SMTP before deploying.",
      );
    }
    console.log(
      [
        "",
        "--------------------------------------------------------------",
        "  EMAIL (not sent - SMTP_HOST is not configured)",
        `  To:      ${mail.to}`,
        `  Subject: ${mail.subject}`,
        "",
        mail.text,
        "--------------------------------------------------------------",
        "",
      ].join("\n"),
    );
    return;
  }

  await getTransport().sendMail({
    from: mailFrom(),
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
  });
}

/** True when a real server is behind `sendMail`. The UI wording depends on it. */
export function isMailConfigured(): boolean {
  return smtpConfigured();
}
