/**
 * Very short-lived cache of "who is this signed-in user" (User + Employee), used by
 * requireAuth so an API call does not pay a database round trip (Render US ↔ Atlas
 * Mumbai ≈ 230 ms) just to re-read the same account it read a moment ago.
 *
 * Safety:
 *  - TTL is a few seconds (PRINCIPAL_CACHE_MS, default 15 s; 0 = off).
 *  - ANY write to a User or Employee through Mongoose (save, update*, delete*,
 *    insertMany, bulkWrite — hooks in models/User.js and models/Employee.js)
 *    clears the whole cache at once, so a deactivation, role or permission
 *    change made in the app applies to the very next request.
 *  - A read that started before such a write is never stored (generation check).
 *  - Each request receives its own fresh Mongoose documents; nothing is shared.
 *  - /auth/login, /auth/refresh and password changes never use it.
 *  The only staleness is a change made OUTSIDE the app (database console,
 *  scripts), visible within PRINCIPAL_CACHE_MS. One Render instance = one cache.
 */
const DEFAULT_TTL_MS = 15_000;
const MAX_ENTRIES = 500;

const ttlMs = () => {
  const raw = process.env.PRINCIPAL_CACHE_MS;
  if (raw !== undefined && raw !== '') return Math.max(0, Number(raw) || 0);
  return process.env.NODE_ENV === 'test' ? 0 : DEFAULT_TTL_MS;
};

let generation = 0;
const entries = new Map(); // userId -> { at, gen, user, employee }

export function invalidatePrincipalCache() {
  generation += 1;
  entries.clear();
}

export const principalCacheGeneration = () => generation;

export function getCachedPrincipal(userId, now = Date.now()) {
  const ttl = ttlMs();
  if (!ttl) return null;
  const hit = entries.get(String(userId));
  if (!hit || hit.gen !== generation || now - hit.at > ttl) return null;
  return hit;
}

/** Stores a principal read that started at generation `gen` (dropped if anything was written since). */
export function setCachedPrincipal(userId, gen, user, employee, now = Date.now()) {
  if (!ttlMs() || gen !== generation) return;
  if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value);
  entries.set(String(userId), { at: now, gen, user, employee });
}

/** Registers cache-clearing hooks on a schema (User, Employee). */
export function invalidatePrincipalCacheOnWrite(schema) {
  // Synchronous, no `next` parameter: Mongoose runs it and continues.
  const clear = function clearPrincipalCache() {
    invalidatePrincipalCache();
  };
  const queryOps = ['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'findOneAndReplace', 'replaceOne', 'deleteOne', 'deleteMany'];
  for (const op of queryOps) {
    schema.pre(op, { document: false, query: true }, clear);
    schema.post(op, { document: false, query: true }, () => invalidatePrincipalCache());
  }
  for (const op of ['save', 'deleteOne', 'updateOne']) {
    schema.pre(op, { document: true, query: false }, clear);
    schema.post(op, { document: true, query: false }, () => invalidatePrincipalCache());
  }
  schema.pre('insertMany', clear);
  schema.post('insertMany', () => invalidatePrincipalCache());
  schema.pre('bulkWrite', clear);
  schema.post('bulkWrite', () => invalidatePrincipalCache());
}
