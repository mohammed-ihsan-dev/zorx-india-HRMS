// Presentation for the phone "Break Time Left" bar. The numbers come from
// useTodayAttendance (breakAllowanceUsage — the End Break countdown's
// calculation); this only turns them into a width, a colour and a label.

export const BREAK_TONE = { GREEN: 'green', ORANGE: 'orange', RED: 'red', EXHAUSTED: 'exhausted' };

// Colour by break time already used today. For the 60-minute allowance:
// under 30 min green, 30 to under 50 orange, 50 and over red. Scaled to the
// configured allowance (30/60 and 50/60 of it) if that is ever changed.
const ORANGE_FROM = 30 / 60;
const RED_FROM = 50 / 60;

/**
 * @param {number} allowanceMinutes daily break allowance (officeSettings.breakDurationMinutes)
 * @param {number} remainingSeconds allowance left, from useTodayAttendance
 */
export function breakTimeLeft(allowanceMinutes, remainingSeconds) {
  const allowanceSeconds = Math.max(0, (allowanceMinutes || 0) * 60);
  const remaining = Math.min(allowanceSeconds, Math.max(0, Number(remainingSeconds) || 0));
  const usedFraction = allowanceSeconds ? (allowanceSeconds - remaining) / allowanceSeconds : 1;
  const tone =
    remaining <= 0 ? BREAK_TONE.EXHAUSTED : usedFraction >= RED_FROM ? BREAK_TONE.RED : usedFraction >= ORANGE_FROM ? BREAK_TONE.ORANGE : BREAK_TONE.GREEN;
  return {
    tone,
    // Rounded up, so "0 min" only ever appears once the allowance is really used up.
    remainingMinutes: Math.ceil(remaining / 60),
    percent: allowanceSeconds ? (remaining / allowanceSeconds) * 100 : 0,
  };
}
