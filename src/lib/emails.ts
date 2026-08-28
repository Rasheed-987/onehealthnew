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

/**
 * "An account has been made for you - get the app."
 *
 * Carries no code and no link, on purpose. A guardian asks for their code from
 * inside the app, seconds before typing it, which is what lets the code live
 * ten minutes instead of a week. It also means this mail holds no credential at
 * all, so a forwarded or leaked copy grants nobody anything.
 */
export async function sendParentWelcomeEmail(options: {
  to: string;
  firstName: string;
  invitedBy: string;
}): Promise<void> {
  const ios = process.env.IOS_STORE_URL?.trim();
  const android = process.env.ANDROID_STORE_URL?.trim();

  // A store whose URL is not configured is omitted rather than rendered as a
  // dead button - an unpublished app should leave no broken link in a mail
  // that families keep.
  const buttons = [
    android && { href: android, label: "Get it on Google Play" },
    ios && { href: ios, label: "Download on the App Store" },
  ].filter(Boolean) as { href: string; label: string }[];

  const steps = [
    "1. Install the Letters and Numbers app.",
    "2. Open it and choose “Sign in with code”.",
    `3. Enter this email address (${options.to}) and we will send you a code.`,
    "4. Enter the code and choose your password.",
  ];

  await sendMail({
    to: options.to,
    subject: "Your Letters and Numbers account is ready",
    text: [
      `Hello ${options.firstName},`,
      "",
      `${options.invitedBy} has created an account for you at Letters and Numbers.`,
      "",
      "To get started:",
      ...steps,
      ...(buttons.length > 0
        ? ["", "Get the app:", ...buttons.map((b) => `${b.label}: ${b.href}`)]
        : []),
      "",
      "If you were not expecting this, you can ignore this email.",
    ].join("\n"),
    html: `<!-- plain, table-free: every client renders this the same way -->
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#1e1f20;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px;margin:0 0 16px">Hello ${escapeHtml(options.firstName)},</h1>
  <p style="margin:0 0 12px">${escapeHtml(options.invitedBy)} has created an account for you at Letters and Numbers.</p>
  <ol style="margin:0 0 16px;padding-left:20px">
    <li style="margin-bottom:4px">Install the Letters and Numbers app.</li>
    <li style="margin-bottom:4px">Open it and choose &ldquo;Sign in with code&rdquo;.</li>
    <li style="margin-bottom:4px">Enter this email address (${escapeHtml(options.to)}) and we will send you a code.</li>
    <li>Enter the code and choose your password.</li>
  </ol>
  ${buttons
    .map(
      (button) =>
        `<p style="margin:0 0 12px"><a href="${button.href}" style="background:#2e9e44;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;font-weight:600">${escapeHtml(button.label)}</a></p>`,
    )
    .join("")}
  <p style="font-size:13px;color:#6e7276;margin:12px 0 0">If you were not expecting this, you can ignore this email.</p>
</div>`,
  });
}

/**
 * The 6-digit code a guardian activates their account with.
 *
 * Deliberately shaped like `sendPasswordResetEmail`, code in the subject line
 * included: that is what makes it readable straight from a phone's notification
 * without opening the mail, which is the entire point of using a code here.
 */
export async function sendActivationCodeEmail(options: {
  to: string;
  firstName: string;
  otp: string;
}): Promise<void> {
  await sendMail({
    to: options.to,
    subject: `${options.otp} is your Letters and Numbers code`,
    text: [
      `Hello ${options.firstName},`,
      "",
      "Enter this 6-digit code in the app to set up your account:",
      "",
      `   ${options.otp}`,
      "",
      "This code expires in 10 minutes.",
      "If you did not ask for it, ignore this email - nothing has changed.",
    ].join("\n"),
    html: `<!-- plain, table-free: every client renders this the same way -->
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#1e1f20;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px;margin:0 0 16px">Hello ${escapeHtml(options.firstName)},</h1>
  <p style="margin:0 0 16px">Enter this 6-digit code in the app to set up your account:</p>
  <div style="background:#f4f5f6;border-radius:8px;padding:16px;text-align:center;margin:20px 0;letter-spacing:6px;font-size:28px;font-weight:700;color:#1e1f20;font-family:monospace">
    ${escapeHtml(options.otp)}
  </div>
  <p style="margin:0;font-size:13px;color:#6e7276">This code expires in 10 minutes. If you did not ask for it, ignore this email &mdash; nothing has changed.</p>
</div>`,
  });
}

export async function sendPasswordResetEmail(options: {
  to: string;
  firstName: string;
  otp: string;
}): Promise<void> {
  const formattedOtp = options.otp.length === 6 
    ? `${options.otp.slice(0, 3)} ${options.otp.slice(3)}` 
    : options.otp;

  await sendMail({
    to: options.to,
    subject: `${options.otp} is your password reset code`,
    text: [
      `Hello ${options.firstName},`,
      "",
      "Someone asked to reset the password on your account. If it was you,",
      "enter this 6-digit verification code on the password reset screen:",
      "",
      `   ${formattedOtp}`,
      "",
      "This code expires in 10 minutes.",
      "If it was not you, ignore this email - your password has not changed.",
    ].join("\n"),
    html: `<!-- plain, table-free: every client renders this the same way -->
<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.6;color:#1e1f20;max-width:520px;margin:0 auto;padding:24px">
  <h1 style="font-size:20px;margin:0 0 16px">Hello ${escapeHtml(options.firstName)},</h1>
  <p style="margin:0 0 16px">Someone asked to reset the password on your account. If it was you, use the 6-digit verification code below:</p>
  <div style="background:#f4f5f6;border-radius:8px;padding:16px;text-align:center;margin:20px 0;letter-spacing:6px;font-size:28px;font-weight:700;color:#1e1f20;font-family:monospace">
    ${escapeHtml(options.otp)}
  </div>
  <p style="margin:0;font-size:13px;color:#6e7276">This code expires in 10 minutes. If it was not you, ignore this email - your password has not changed.</p>
</div>`,
  });
}
