import nodemailer from "nodemailer";

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
}

export type SendEmail = (message: EmailMessage) => Promise<void>;

/**
 * Sends through SMTP when SMTP_URL is set (e.g. smtps://user:pass@smtp.host:465),
 * otherwise logs to stdout so reminders can be exercised locally.
 */
export function createEmailSender(env: NodeJS.ProcessEnv = process.env): SendEmail {
  const from = env.EMAIL_FROM ?? "ODPC Compliance <reminders@localhost>";
  if (!env.SMTP_URL) {
    return async (m) => {
      console.log(`[email:dev] to=${m.to.join(",")} subject=${JSON.stringify(m.subject)}\n${m.text}\n`);
    };
  }
  const transport = nodemailer.createTransport(env.SMTP_URL);
  return async (m) => {
    await transport.sendMail({ from, to: m.to, subject: m.subject, text: m.text });
  };
}
