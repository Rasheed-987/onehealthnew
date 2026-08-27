import { isMailConfigured, mailFrom, sendMail } from "../src/lib/mailer";

/**
 * Proves the SMTP settings in `.env` actually deliver, without going through
 * the invitation UI.
 *
 *   npm run mail:test -- you@example.com
 *
 * The invite flow swallows mail failures on purpose (the account is already
 * created by then), so a broken transport shows up there as a quiet "invite
 * not sent" rather than a stack trace. This surfaces the real error.
 */

async function main() {
  const to = process.argv[2];
  if (!to) {
    console.error("Usage: npm run mail:test -- you@example.com");
    process.exit(1);
  }

  if (!isMailConfigured()) {
    console.error(
      [
        "SMTP_HOST is not set, so nothing would be delivered.",
        "Fill in SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD in .env first.",
      ].join("\n"),
    );
    process.exit(1);
  }

  console.log(`host    ${process.env.SMTP_HOST}:${process.env.SMTP_PORT ?? 587}`);
  console.log(`user    ${process.env.SMTP_USER ?? "(no auth)"}`);
  console.log(`from    ${mailFrom()}`);
  console.log(`to      ${to}`);
  console.log("");

  await sendMail({
    to,
    subject: "Letters and Numbers - SMTP test",
    text: "If you are reading this, invitation and password-reset emails will send.",
    html: "<p>If you are reading this, invitation and password-reset emails will send.</p>",
  });

  console.log("Accepted by the server. Check the inbox (and the spam folder).");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error("\nSend failed:\n");
    console.error(error);
    process.exit(1);
  },
);
