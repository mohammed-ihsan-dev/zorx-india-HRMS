// Pure rules for the app-update flow (no browser APIs), shared by automatic
// updates and Menu → Check for Updates.

export const CHECK_EVERY_MS = 30 * 60 * 1000; // background check while the tab is visible
export const RECHECK_ON_VISIBLE_MS = 5 * 60 * 1000; // when returning to the tab, if not checked recently
export const IDLE_BEFORE_APPLY_MS = 5 * 1000; // no taps/typing for this long before an automatic reload
export const RETRY_GUARD_MS = 2 * 60 * 1000; // never auto-reload twice for the same build within this window
export const SNOOZE_MS = 30 * 60 * 1000; // "Later"

/** Validates /version.json. Returns { version, build, builtAt } or null. */
export function parseManifest(data) {
  if (!data || typeof data !== 'object') return null;
  const { version, build, builtAt } = data;
  if (typeof version !== 'string' || typeof build !== 'string' || !version || !build) return null;
  return { version, build, builtAt: typeof builtAt === 'string' ? builtAt : null };
}

/** True when the deployed build differs from the one this tab is running. */
export const isNewBuild = (currentBuild, latest) => Boolean(latest?.build) && latest.build !== currentBuild;

export const formatVersion = (version, build) => (build ? `${version} (${build})` : version);

/**
 * Why an automatic reload would be unsafe right now, or null when it is safe.
 * Order matters only for the message shown.
 */
export function unsafeReason({ pendingSaves = 0, dialogOpen = false, unsavedInput = false, msSinceInteraction = Infinity }) {
  if (pendingSaves > 0) return 'saving';
  if (dialogOpen) return 'dialog';
  if (unsavedInput) return 'unsaved';
  if (msSinceInteraction < IDLE_BEFORE_APPLY_MS) return 'active';
  return null;
}

/**
 * Whether to reload into the new version automatically now.
 * `lastAttempt` = { build, at } of the previous automatic attempt (this tab session).
 */
export function shouldAutoApply({ pending, unsafe, snoozedUntil = 0, lastAttempt = null, targetBuild, now }) {
  if (!pending || unsafe) return false;
  if (snoozedUntil > now) return false;
  // A recent attempt for the same build that didn't take: don't loop, leave it to the toast.
  if (lastAttempt && lastAttempt.build === targetBuild && now - lastAttempt.at < RETRY_GUARD_MS) return false;
  return true;
}

/** Wraps an async function so overlapping calls share one in-flight run. */
export function singleFlight(fn) {
  let inFlight = null;
  return (...args) => {
    if (!inFlight) {
      inFlight = Promise.resolve()
        .then(() => fn(...args))
        .finally(() => {
          inFlight = null;
        });
    }
    return inFlight;
  };
}
