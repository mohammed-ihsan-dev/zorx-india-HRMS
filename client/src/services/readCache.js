/**
 * Small read-through cache for slowly changing, non-sensitive reference data
 * (published announcements, holidays, departments) so moving between pages does
 * not refetch them every time.
 *
 * Rules:
 *  - TTL 50 minutes by default; after that the next read fetches fresh data.
 *  - Entries are keyed by the signed-in user + role (the "owner") and the query.
 *    A different owner — another login, or logout — clears everything first, so
 *    one account can never see another account's cached data.
 *  - Writes through the app (create / update / delete) invalidate their list at once.
 *  - In memory, mirrored to sessionStorage (this tab only) so a reload stays fast.
 *  - NEVER used for attendance, check-in/out eligibility, GPS, WFH/onsite approvals,
 *    leave balances or approvals, payroll, auth or permissions — those always go
 *    to the server.
 */
export const READ_CACHE_TTL_MS = 50 * 60 * 1000;
const STORAGE_KEY = 'zorx_read_cache_v1';

let owner = null;
let entries = new Map(); // key -> { at, data }
const inFlight = new Map(); // key -> Promise

function storage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

function persist() {
  const s = storage();
  if (!s) return;
  try {
    if (!owner || entries.size === 0) s.removeItem(STORAGE_KEY);
    else s.setItem(STORAGE_KEY, JSON.stringify({ owner, entries: [...entries] }));
  } catch {
    // quota / private mode: the in-memory cache still works
  }
}

function restore(nextOwner) {
  const s = storage();
  if (!s) return;
  try {
    const saved = JSON.parse(s.getItem(STORAGE_KEY) || 'null');
    if (saved?.owner === nextOwner && Array.isArray(saved.entries)) entries = new Map(saved.entries);
  } catch {
    // ignore a corrupt entry
  }
}

/** Called by AuthContext whenever the signed-in user changes (null = signed out). */
export function setCacheOwner(nextOwner) {
  if (nextOwner === owner) return;
  entries = new Map();
  inFlight.clear();
  owner = nextOwner || null;
  if (owner) restore(owner);
  persist();
}

export function clearReadCache() {
  entries = new Map();
  inFlight.clear();
  persist();
}

const keyOf = (name, params) => `${owner}|${name}|${JSON.stringify(params ?? null)}`;

/**
 * Returns cached data for (name, params) when fresh, otherwise calls `fetcher` once
 * (concurrent callers share the request) and caches a successful result.
 * Without a signed-in owner nothing is cached.
 */
export function cachedRead(name, params, fetcher, { ttlMs = READ_CACHE_TTL_MS, now = Date.now } = {}) {
  if (!owner) return fetcher();
  const key = keyOf(name, params);
  const hit = entries.get(key);
  if (hit && now() - hit.at < ttlMs) return Promise.resolve(hit.data);
  if (inFlight.has(key)) return inFlight.get(key);
  const forOwner = owner;
  const p = Promise.resolve()
    .then(fetcher)
    .then((data) => {
      if (owner === forOwner) {
        entries.set(key, { at: now(), data });
        persist();
      }
      return data;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

/** Drops every cached query of `name` (after a create / update / delete). */
export function invalidateRead(name) {
  const prefix = `${owner}|${name}|`;
  for (const k of [...entries.keys()]) if (k.startsWith(prefix)) entries.delete(k);
  for (const k of [...inFlight.keys()]) if (k.startsWith(prefix)) inFlight.delete(k);
  persist();
}
