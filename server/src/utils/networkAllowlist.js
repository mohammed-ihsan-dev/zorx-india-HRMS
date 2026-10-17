import net from 'node:net';

// Private / non-routable ranges: a public-IP allowlist entry inside these could
// never match a real client seen by the hosted backend, so it's a config error.
const NON_PUBLIC = new net.BlockList();
for (const [cidr, prefix] of [['10.0.0.0', 8], ['172.16.0.0', 12], ['192.168.0.0', 16], ['127.0.0.0', 8], ['169.254.0.0', 16], ['100.64.0.0', 10], ['0.0.0.0', 8]]) {
  NON_PUBLIC.addSubnet(cidr, prefix, 'ipv4');
}
for (const [cidr, prefix] of [['fc00::', 7], ['fe80::', 10], ['::1', 128], ['::', 128]]) {
  NON_PUBLIC.addSubnet(cidr, prefix, 'ipv6');
}

/** "::ffff:1.2.3.4" → "1.2.3.4"; trims; returns null for anything that isn't an IP. */
export function normalizeIp(value) {
  if (typeof value !== 'string') return null;
  let ip = value.trim();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (mapped) ip = mapped[1];
  return net.isIP(ip) ? ip : null;
}

const familyOf = (ip) => (net.isIP(ip) === 6 ? 'ipv6' : 'ipv4');

/**
 * Parses a comma-separated list of public IPs / CIDR ranges.
 * Returns { ok, entries, errors, list }; ok=false if empty or any entry is invalid.
 */
export function parseAllowlist(raw) {
  const list = new net.BlockList();
  const entries = [];
  const errors = [];

  for (const part of String(raw || '').split(',').map((s) => s.trim()).filter(Boolean)) {
    const [addr, prefixStr, ...rest] = part.split('/');
    const ip = normalizeIp(addr);
    if (!ip || rest.length) {
      errors.push(`"${part}" is not a valid IP address or CIDR range`);
      continue;
    }
    const family = familyOf(ip);
    const maxPrefix = family === 'ipv6' ? 128 : 32;
    const prefix = prefixStr === undefined ? maxPrefix : Number(prefixStr);
    if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix || (prefixStr !== undefined && !/^\d+$/.test(prefixStr))) {
      errors.push(`"${part}" has an invalid prefix length`);
      continue;
    }
    if (NON_PUBLIC.check(ip, family)) {
      errors.push(`"${part}" is a private/local address and can never be a public source IP`);
      continue;
    }
    list.addSubnet(ip, prefix, family);
    entries.push(`${ip}/${prefix}`);
  }

  if (!entries.length && !errors.length) errors.push('No company network IPs are configured (ATTENDANCE_WIFI_ALLOWED_IPS).');
  return { ok: errors.length === 0, entries, errors, list };
}

/** True only if `clientIp` is a valid IP inside a valid, non-empty allowlist. */
export function isIpAllowed(clientIp, allowlist) {
  if (!allowlist?.ok) return false;
  const ip = normalizeIp(clientIp);
  if (!ip) return false;
  return allowlist.list.check(ip, familyOf(ip));
}
