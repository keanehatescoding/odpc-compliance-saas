import nodemailer from "nodemailer";

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
}

export type SendEmail = (message: EmailMessage) => Promise<void>;

/**
 * Whether emails go to stdout instead of SMTP: always without SMTP_URL in
 * development, and in production only when EMAIL_LOG_ONLY=true (e.g. a demo
 * deploy). Otherwise a production server without SMTP would print reset links
 * to the log and never send breach alerts.
 */
function logOnly(env: NodeJS.ProcessEnv): boolean {
  if (env.SMTP_URL) return false;
  if (env.NODE_ENV !== "production" || env.EMAIL_LOG_ONLY === "true") return true;
  throw new Error("SMTP_URL must be set in production (or EMAIL_LOG_ONLY=true to print emails to the log instead).");
}

/** Throws if email isn't configured. Called at server start so a bad deploy fails its health check. */
export function assertEmailConfigured(env: NodeJS.ProcessEnv = process.env): void {
  logOnly(env);
}

/**
 * Sends through SMTP when SMTP_URL is set (e.g. smtps://user:pass@smtp.host:465),
 * otherwise logs to stdout so reminders can be exercised locally.
 */
export function createEmailSender(env: NodeJS.ProcessEnv = process.env): SendEmail {
  const from = env.EMAIL_FROM ?? "ODPC Compliance <reminders@localhost>";
  if (logOnly(env)) {
    return async (m) => {
      console.log(`[email:dev] to=${m.to.join(",")} subject=${JSON.stringify(m.subject)}\n${m.text}\n`);
    };
  }
  const transport = nodemailer.createTransport(env.SMTP_URL);
  return async (m) => {
    await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text });
  };
}
