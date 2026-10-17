import { useState } from 'react';
import { Mail } from 'lucide-react';
import { Card, CardHeader } from '../../components/Card.jsx';
import { Button } from '../../components/Button.jsx';
import * as settingsService from '../../services/settingsService.js';
import { getErrorMessage } from '../../services/apiClient.js';

const EXPLAIN = {
  NOT_CONFIGURED: 'Email is not configured on the server. Set RESEND_API_KEY and MAIL_FROM (an address on a domain verified in Resend), then redeploy.',
  CONNECTION_FAILED: 'The server could not reach the email provider (network error or timeout). With SMTP on Render free instances, ports 25/465/587 are blocked — use RESEND_API_KEY instead.',
  AUTH_FAILED: 'The email provider rejected the credentials. Check that RESEND_API_KEY is correct, not revoked, and has sending permission.',
  SENDER_NOT_VERIFIED: 'The sender is not allowed. MAIL_FROM must use a domain that is verified in Resend (e.g. noreply@zorxindia.online).',
  RATE_LIMITED: 'The email provider is rate-limiting requests. Wait a minute and try again.',
  PROVIDER_ERROR: 'The email provider had a temporary error. Try again in a few minutes.',
  TLS_FAILED: 'Secure connection failed. Check SMTP_PORT and SMTP_SECURE (465 → true, 587 → false).',
  REJECTED_BY_PROVIDER: 'The email provider refused the message — see the details below.',
  SEND_FAILED: 'Sending failed for another reason — see the details below and the server logs.',
};

/** Admin check that runs on the real server: sends one test email to yourself via the configured provider. */
export function EmailDeliveryCard() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const run = async () => {
    setRunning(true);
    setError('');
    setResult(null);
    try {
      setResult(await settingsService.testEmailDelivery());
    } catch (err) {
      setError(getErrorMessage(err, 'Could not run the email test.'));
    } finally {
      setRunning(false);
    }
  };

  const ok = result?.delivery === 'ACCEPTED_BY_PROVIDER';
  return (
    <Card padded={false} className="p-5">
      <CardHeader title="Email Delivery" subtitle="Used for password reset codes" />
      <div className="space-y-3">
        <Button type="button" variant="outline" icon={Mail} onClick={run} loading={running}>
          Send Test Email to Me
        </Button>
        <p className="text-xs text-slate-500">Sends one test email to your own address from this server (limited to one test every 30 seconds).</p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {result && (
          <div className={`rounded-lg border p-3.5 text-sm space-y-1 ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
            <p className="font-semibold">{ok ? 'Accepted by the email provider — check your inbox (and spam). Acceptance is not proof of inbox delivery.' : 'Test email was NOT sent.'}</p>
            {!ok && <p>{EXPLAIN[result.category] || EXPLAIN.SEND_FAILED}</p>}
            <p className="font-mono text-xs break-all">
              {result.config?.provider === 'resend'
                ? `provider Resend · API key ${result.config.apiKeySet ? 'set' : 'missing'} · from ${result.config.from || '—'}`
                : `provider ${result.config?.provider || 'none'} · ${result.config?.host || 'no host'}:${result.config?.port} · secure ${String(result.config?.secure)} · user ${result.config?.user || '—'} · password ${result.config?.passwordSet ? 'set' : 'missing'}`}
              {` · connection ${result.connection}`}
              {result.code ? ` · ${result.code}` : ''}
              {result.responseCode ? ` ${result.responseCode}` : ''}
              {result.messageId ? ` · message id ${result.messageId}` : ''}
              {result.id ? ` · log id ${result.id}` : ''}
            </p>
            {!ok && result.message && <p className="font-mono text-xs break-all">{result.message}</p>}
          </div>
        )}
      </div>
    </Card>
  );
}
