import nodemailer from 'nodemailer';
import { env, isTest } from '../config/env.js';

let transport = null;

/** Tests swap in nodemailer's in-memory JSON transport; nothing real is ever sent. */
export function setMailTransportForTests(testTransport) {
  transport = testTransport;
}

export function isMailConfigured() {
  return Boolean(env.mail.host && env.mail.user && env.mail.pass && env.mail.from);
}

function getTransport() {
  if (transport) return transport;
  if (isTest) return null;
  if (!isMailConfigured()) return null;
  transport = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.secure,
    auth: { user: env.mail.user, pass: env.mail.pass },
  });
  return transport;
}

/** Sends an email; returns false (never throws) when mail isn't configured or sending fails. */
export async function sendMail({ to, subject, text, html }) {
  const t = getTransport();
  if (!t) {
    console.warn('[mail] Email is not configured (SMTP_HOST/SMTP_USER/SMTP_PASS/MAIL_FROM); message not sent.');
    return false;
  }
  try {
    await t.sendMail({ from: env.mail.from || 'zorx-hrms@localhost', to, subject, text, html });
    return true;
  } catch (err) {
    // Never log message bodies — they can contain one-time reset links.
    console.error('[mail] Failed to send email:', err.message);
    return false;
  }
}
