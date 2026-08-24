import { appUrl, sendMail } from "@/lib/mailer";

/**
 * The messages the app sends, and the links inside them.
 *
 * Kept apart from `mailer.ts` so the transport and the content can change
 * independently. Both mails are deliberately plain: an invitation that looks
 * like marketing is an invitation that lands in spam.
 */

/** Escapes interpolated values so a name with an angle bracket cannot inject markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout(heading: string, body: string, button: { href: string; label: string }): string {
  return `<!-- plain, table-free: every client renders this the same way -->
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#1e1f20;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>
  ${body}
  <p style="margin:24px 0">
    <a href="${button.href}" style="background:#2e9e44;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;font-weight:600">${escapeHtml(button.label)}</a>
  </p>
  <p style="font-size:13px;color:#6e7276;margin:0">
    If the button does not work, copy this link into your browser:<br>
    <span style="word-break:break-all">${button.href}</span>
  </p>
</div>`;
}

export async function sendInviteEmail(options: {
  to: string;
  firstName: string;
  token: string;
  expiresAt: Date;
  invitedBy: string;
}): Promise<void> {
  const link = `${appUrl()}/accept-invite/${options.token}`;
  const expires = options.expiresAt.toISOString().slice(0, 10);

  await sendMail({
    to: options.to,
    subject: "Your Letters and Numbers account",
    text: [
      `Hello ${options.firstName},`,
      "",
      `${options.invitedBy} has created an account for you at Letters and Numbers.`,
      "",
      "Choose your password to activate it:",
      link,
      "",
      `This link works once and expires on ${expires}.`,
      "If you were not expecting this, you can ignore this email.",
    ].join("\n"),
    html: layout(
      `Hello ${options.firstName},`,
      `<p style="margin:0 0 12px">${escapeHtml(options.invitedBy)} has created an account for you at Letters and Numbers. Choose a password to activate it.</p>
       <p style="margin:0;font-size:13px;color:#6e7276">This link works once and expires on ${expires}. If you were not expecting this, you can ignore this email.</p>`,
      { href: link, label: "Choose your password" },
    ),
  });
}

export async function sendPasswordResetEmail(options: {
  to: string;
  firstName: string;
  token: string;
}): Promise<void> {
  const link = `${appUrl()}/reset-password/${options.token}`;

  await sendMail({
    to: options.to,
    subject: "Reset your Letters and Numbers password",
    text: [
      `Hello ${options.firstName},`,
      "",
      "Someone asked to reset the password on your account. If it was you,",
      "use this link to choose a new one:",
      link,
      "",
      "The link works once and expires in one hour.",
      "If it was not you, ignore this email - your password has not changed.",
    ].join("\n"),
    html: layout(
      `Hello ${options.firstName},`,
      `<p style="margin:0 0 12px">Someone asked to reset the password on your account. If it was you, choose a new one below.</p>
       <p style="margin:0;font-size:13px;color:#6e7276">The link works once and expires in one hour. If it was not you, ignore this email - your password has not changed.</p>`,
      { href: link, label: "Choose a new password" },
    ),
  });
}
