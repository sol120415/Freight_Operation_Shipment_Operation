import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

export interface TransactionalEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | undefined;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS;
  const port = Number(process.env.SMTP_PORT ?? "587");
  const secureSetting = process.env.SMTP_SECURE?.trim().toLowerCase();

  if (!host || !user || !pass) {
    throw new Error("SMTP_HOST, SMTP_USER, and SMTP_PASS must be configured.");
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid port number.");
  }
  if (secureSetting && secureSetting !== "true" && secureSetting !== "false") {
    throw new Error("SMTP_SECURE must be either true or false.");
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: secureSetting ? secureSetting === "true" : port === 465,
    auth: { user, pass },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
  return transporter;
}

export async function sendTransactionalEmail(message: TransactionalEmail): Promise<void> {
  const fromEmail = process.env.OTP_FROM_EMAIL?.trim();
  if (!fromEmail) throw new Error("OTP_FROM_EMAIL must be configured.");

  const fromName = process.env.OTP_FROM_NAME?.trim() || "Airship Express";
  await getTransporter().sendMail({
    from: {
      name: fromName.replace(/[\r\n]/g, " "),
      address: fromEmail,
    },
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
}
