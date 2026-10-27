// What the page is doing right now, so an automatic update never reloads in the
// middle of something: requests that change data (check-in, leave request,
// uploads…), an open dialog, typed-but-unsubmitted input, or recent activity.

let pendingSaves = 0;
// Fields edited but not yet submitted. Input only counts while its field is
// still on the page: a closed dialog or a route change discards it anyway.
const editedFields = new Set();
let lastInteractionAt = 0;

/** Called by apiClient around every non-GET request. */
export const beginSave = () => {
  pendingSaves += 1;
};
export const endSave = () => {
  pendingSaves = Math.max(0, pendingSaves - 1);
};

/** Forget typed input (form submitted, or the page/route changed so it's gone anyway). */
export const clearUnsavedInput = () => {
  editedFields.clear();
};

function hasUnsavedInput() {
  for (const el of editedFields) if (!el.isConnected) editedFields.delete(el);
  return editedFields.size > 0;
}

const isTrackedField = (el) =>
  typeof Element !== 'undefined' &&
  el instanceof Element &&
  el.matches('input, textarea, select, [contenteditable="true"]') &&
  !el.matches('[type="search"], [data-update-safe]');

/** Starts listening on `doc`; returns a cleanup function. */
export function installUpdateGuards(doc = document) {
  const onInput = (e) => {
    if (isTrackedField(e.target)) editedFields.add(e.target);
  };
  const onInteract = () => {
    lastInteractionAt = Date.now();
  };
  const onSubmit = (e) => {
    for (const el of editedFields) if (e.target instanceof Element && e.target.contains(el)) editedFields.delete(el);
  };
  doc.addEventListener('input', onInput, true);
  doc.addEventListener('change', onInput, true);
  doc.addEventListener('submit', onSubmit, true);
  for (const type of ['pointerdown', 'keydown', 'touchstart']) doc.addEventListener(type, onInteract, { capture: true, passive: true });
  return () => {
    doc.removeEventListener('input', onInput, true);
    doc.removeEventListener('change', onInput, true);
    doc.removeEventListener('submit', onSubmit, true);
    for (const type of ['pointerdown', 'keydown', 'touchstart']) doc.removeEventListener(type, onInteract, { capture: true });
  };
}

/** Snapshot for updatePolicy.unsafeReason. */
export function getUpdateSafety(doc = document, now = Date.now()) {
  const focused = doc.activeElement;
  return {
    pendingSaves,
    dialogOpen: Boolean(doc.querySelector('[data-zm-modal]')),
    // A focused field counts as unsaved too (typing is in progress).
    unsavedInput: hasUnsavedInput() || (isTrackedField(focused) && !focused.matches('[type="checkbox"], [type="radio"], [type="button"]')),
    msSinceInteraction: now - lastInteractionAt,
  };
}

/** Test hook. */
export function _resetUpdateGuard() {
  pendingSaves = 0;
  editedFields.clear();
  lastInteractionAt = 0;
}
