import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { env, isTest } from '../config/env.js';

let transport = null;

/** Tests swap in an in-memory transport; nothing real is ever sent. */
export function setMailTransportForTests(testTransport) {
  transport = testTransport;
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const RESEND_TIMEOUT_MS = 10_000;

/** 'resend' when RESEND_API_KEY is set (preferred), else 'smtp' when SMTP is configured, else null. */
export function getMailProvider() {
  if (env.mail.resendApiKey) return 'resend';
  if (env.mail.host && env.mail.user && env.mail.pass) return 'smtp';
  return null;
}

export function isMailConfigured() {
  return Boolean(getMailProvider() && env.mail.from);
}

const UNVERIFIABLE_SENDER_DOMAINS = ['gmail.com', 'googlemail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com'];

/** Configuration problems that will stop emails going out, phrased for the server log. Never includes secrets. */
export function mailConfigWarnings() {
  const warnings = [];
  const provider = getMailProvider();
  if (!provider) {
    warnings.push('No email provider configured — password reset codes cannot be sent. Set RESEND_API_KEY and MAIL_FROM.');
    return warnings;
  }
  if (!env.mail.from) warnings.push('MAIL_FROM is not set — password reset codes cannot be sent.');
  if (provider === 'smtp' && !isTest) {
    warnings.push('Using SMTP. Hosts such as Render free instances block outbound SMTP ports (25/465/587); set RESEND_API_KEY to send over HTTPS.');
  }
  if (provider === 'resend') {
    if (!env.mail.resendApiKey.startsWith('re_')) warnings.push('RESEND_API_KEY does not look like a Resend key (expected it to start with "re_").');
    const domain = (env.mail.from.match(/@([^\s>]+)/)?.[1] || '').toLowerCase();
    if (UNVERIFIABLE_SENDER_DOMAINS.includes(domain)) {
      warnings.push(`MAIL_FROM uses ${domain}, which cannot be verified in Resend — use an address on your own verified domain (e.g. noreply@zorxindia.online).`);
    }
  }
  return warnings;
}

function providerError(message, props) {
  return Object.assign(new Error(message), props);
}

/**
 * Resend HTTPS API (port 443 — unaffected by hosts that block SMTP ports) behind
 * the same shape as a nodemailer transport, so callers and error handling are
 * shared. One request per call: no automatic retries, so no duplicate emails.
 */
export function createResendTransport({ apiKey, fetchImpl = globalThis.fetch, timeoutMs = RESEND_TIMEOUT_MS }) {
  return {
    async sendMail({ from, to, subject, text, html }) {
      let res;
      try {
        res = await fetchImpl(RESEND_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            // Lets Resend drop an accidental duplicate of this exact request.
            'Idempotency-Key': crypto.randomUUID(),
          },
          body: JSON.stringify({ from, to: [to], subject, text, html }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
        throw providerError(timedOut ? 'Request to Resend timed out' : `Could not reach Resend: ${err?.message || 'network error'}`, {
          code: timedOut ? 'ETIMEDOUT' : 'ECONNECTION',
        });
      }

      let body = {};
      try {
        body = await res.json();
      } catch {
        body = {};
      }
      if (res.ok && body?.id) {
        return { accepted: [to], rejected: [], messageId: body.id, response: `Resend id ${body.id}` };
      }

      const name = String(body?.name || '');
      const message = String(body?.message || `Resend responded with HTTP ${res.status}`);
      let code = 'EENVELOPE';
      if (['missing_api_key', 'invalid_api_key', 'restricted_api_key'].includes(name) || res.status === 401) code = 'EAUTH';
      else if (res.status === 429) code = 'ERATELIMIT';
      else if (res.status >= 500) code = 'EPROVIDER';
      else if (/domain|from|sender/i.test(message)) code = 'ESENDER';
      throw providerError(message, { code, responseCode: res.status, command: name || 'POST /emails' });
    },
  };
}

function getTransport() {
  if (transport) return transport;
  if (isTest) return null;
  if (!isMailConfigured()) return null;
  if (getMailProvider() === 'resend') {
    transport = createResendTransport({ apiKey: env.mail.resendApiKey });
    return transport;
  }
  transport = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    secure: env.mail.secure,
    auth: { user: env.mail.user, pass: env.mail.pass },
    // Fail fast and visibly (e.g. when the host blocks outbound SMTP) instead
    // of nodemailer's ~2 minute default connection timeout.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

const providerLabel = () => (getMailProvider() === 'resend' ? 'Resend' : `${env.mail.host}:${env.mail.port}`);

/** "zorxindia@gmail.com" → "zo***@gmail.com" — enough to tell attempts apart in logs. */
export function maskEmail(email) {
  const [local = '', domain = ''] = String(email || '').split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

// What kind of failure an SMTP error is, without any secrets or message content.
function classify(err) {
  const code = err?.code || '';
  if (['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND', 'EDNS'].includes(code) || (code === 'ECONNECTION' && !err?.responseCode) || /timeout|unreachable/i.test(err?.message || '')) {
    return 'CONNECTION_FAILED';
  }
  if (code === 'EAUTH' || err?.responseCode === 535 || err?.responseCode === 534) return 'AUTH_FAILED';
  if (code === 'ERATELIMIT') return 'RATE_LIMITED';
  if (code === 'ESENDER') return 'SENDER_NOT_VERIFIED';
  if (code === 'EPROVIDER') return 'PROVIDER_ERROR';
  if (code === 'EENVELOPE' || [550, 551, 553, 554].includes(err?.responseCode)) return 'REJECTED_BY_PROVIDER';
  if (code === 'ETLS' || /certificate|ssl|tls/i.test(err?.message || '')) return 'TLS_FAILED';
  return 'SEND_FAILED';
}

/** Sanitized error details safe to log or show to an admin: no addresses, credentials or bodies. */
function describeError(err) {
  return {
    category: classify(err),
    code: err?.code || null,
    responseCode: err?.responseCode || null,
    command: err?.command || null,
    message: String(err?.message || '')
      .replace(/[^\s@<>]+@[^\s@<>]+/g, '<address>')
      .slice(0, 200),
  };
}

/**
 * Sends an email and reports what happened. Never throws and never logs the
 * message body (it may contain a one-time code). Every attempt logs one line
 * with an id so a request can be matched to its outcome in the server logs.
 */
export async function sendMailWithResult({ to, subject, text, html }) {
  const id = crypto.randomBytes(4).toString('hex');
  const t = getTransport();
  if (!t) {
    console.warn(`[mail ${id}] NOT SENT to ${maskEmail(to)}: email is not configured (RESEND_API_KEY + MAIL_FROM, or SMTP_* + MAIL_FROM).`);
    return { ok: false, id, category: 'NOT_CONFIGURED' };
  }
  try {
    const info = await t.sendMail({ from: env.mail.from, to, subject, text, html });
    const accepted = (info?.accepted || []).length;
    const rejected = (info?.rejected || []).length;
    if (info && !accepted && rejected) {
      console.error(`[mail ${id}] REJECTED for ${maskEmail(to)} by ${providerLabel()}`);
      return { ok: false, id, category: 'REJECTED_BY_PROVIDER' };
    }
    console.info(`[mail ${id}] ACCEPTED by ${providerLabel()} for ${maskEmail(to)}${info?.response ? ` (${String(info.response).slice(0, 60)})` : ''}`);
    return { ok: true, id, messageId: info?.messageId || null };
  } catch (err) {
    const detail = describeError(err);
    console.error(`[mail ${id}] FAILED for ${maskEmail(to)} via ${providerLabel()}: ${detail.category} ${detail.code || ''} ${detail.responseCode || ''} ${detail.message}`);
    return { ok: false, id, ...detail };
  }
}

/** Boolean convenience wrapper used by existing callers. */
export async function sendMail(message) {
  return (await sendMailWithResult(message)).ok;
}

/**
 * Admin diagnostic against the server's real environment: checks the SMTP
 * connection + login, then sends one test email to `to`. Returns only
 * sanitized results (never the password).
 */
export async function runMailDiagnostic(to) {
  const provider = getMailProvider();
  const config = {
    provider: provider || 'none',
    apiKeySet: Boolean(env.mail.resendApiKey),
    host: provider === 'resend' ? 'api.resend.com' : env.mail.host || null,
    port: env.mail.port,
    secure: env.mail.secure,
    user: env.mail.user ? maskEmail(env.mail.user) : null,
    from: env.mail.from ? env.mail.from.replace(/[^\s@<>]+@/, (m) => `${m.slice(0, 2)}***@`) : null,
    passwordSet: Boolean(env.mail.pass),
  };
  if (!isMailConfigured()) return { config, configured: false, connection: 'SKIPPED', delivery: 'SKIPPED', category: 'NOT_CONFIGURED' };

  const t = getTransport();
  try {
    if (typeof t.verify === 'function') await t.verify();
  } catch (err) {
    return { config, configured: true, connection: 'FAILED', delivery: 'SKIPPED', ...describeError(err) };
  }
  const result = await sendMailWithResult({
    to,
    subject: 'ZORX INDIA HRMS — email test',
    text: 'This is a test email from ZORX INDIA HRMS. If you received it, password reset emails can be delivered.',
    html: '<p>This is a test email from <strong>ZORX INDIA HRMS</strong>.</p><p>If you received it, password reset emails can be delivered.</p>',
  });
  const connection = result.category === 'CONNECTION_FAILED' ? 'FAILED' : 'OK';
  return { config, configured: true, connection, delivery: result.ok ? 'ACCEPTED_BY_PROVIDER' : 'FAILED', ...result };
}
