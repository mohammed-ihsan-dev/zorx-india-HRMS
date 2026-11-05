// Onsite dates are UTC-midnight calendar-day keys (like Attendance.date), so they
// are shown in UTC to display exactly the requested day in any timezone.
export function formatOnsiteDate(value, options = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' });
}

/** "YYYY-MM-DD" for a stored day key (for the edit form's date input). */
export const onsiteDateInputValue = (value) => (value ? new Date(value).toISOString().slice(0, 10) : '');

export const ONSITE_REASONS = ['Videography', 'Outdoor Shoot', 'Client Shoot', 'Production Work'];

/** Client-side check mirroring the server rules (the server stays the authority). */
export function validateOnsiteForm(form, todayYMD) {
  if (!form.date) return 'Please select a date.';
  if (form.date < todayYMD) return 'Onsite work cannot be requested for a past date. Please contact HR/Admin for an attendance correction.';
  if (form.reason.trim().length < 2) return 'Please provide a reason.';
  if (form.workLocation.trim().length < 2) return 'Please enter the onsite work location.';
  return '';
}
