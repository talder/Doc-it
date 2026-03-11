import nodemailer from "nodemailer";
import { readJsonConfig } from "./config";

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  adminEmail: string;
}

const SMTP_FILE = "smtp.json";

const DEFAULT_SMTP: SmtpConfig = {
  host: "",
  port: 587,
  secure: false,
  user: "",
  pass: "",
  from: "",
  adminEmail: "",
};

export async function getSmtpConfig(): Promise<SmtpConfig> {
  return readJsonConfig<SmtpConfig>(SMTP_FILE, DEFAULT_SMTP);
}

export async function sendMail(
  to: string,
  subject: string,
  html: string
): Promise<boolean> {
  try {
    const cfg = await getSmtpConfig();
    if (!cfg.host || !cfg.from) return false;

    const transporter = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });

    await transporter.sendMail({ from: cfg.from, to, subject, html });
    return true;
  } catch (e) {
    console.error("sendMail failed:", e);
    return false;
  }
}
