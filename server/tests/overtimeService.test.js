import { calculateOvertimeMinutes, overtimeForRecord, overtimeRuleFor } from '../src/services/overtimeService.js';

// The company overtime rule: check-out at or before 7:00 PM → 0; after 7:00 PM
// → check-out − 6:00 PM. Company time (Asia/Kolkata), recorded check-out only.
const TZ = 'Asia/Kolkata';
const day = (ymd) => new Date(`${ymd}T00:00:00.000Z`);
const ist = (ymd, hms) => new Date(`${ymd}T${hms}+05:30`);
const ot = (out, opts = {}) => calculateOvertimeMinutes(day('2026-10-26'), out, { timeZone: TZ, ...opts });

describe('the 7 PM eligibility / 6 PM start rule', () => {
  test.each([
    ['05:30 PM', '17:30:00', 0],
    ['06:00 PM', '18:00:00', 0],
    ['06:30 PM', '18:30:00', 0],
    ['06:50 PM', '18:50:00', 0],
    ['07:00 PM exactly', '19:00:00', 0],
    ['07:00:59 PM (same minute)', '19:00:59', 0],
    ['07:01 PM', '19:01:00', 61],
    ['07:15 PM', '19:15:00', 75],
    ['07:30 PM', '19:30:00', 90],
    ['08:00 PM', '20:00:00', 120],
    ['08:15 PM', '20:15:00', 135],
    ['09:00 PM', '21:00:00', 180],
    ['09:21 PM', '21:21:00', 201],
  ])('check-out %s → %i min', (_, hms, minutes) => {
    expect(ot(ist('2026-10-26', hms))).toBe(minutes);
  });

  test('never calculated as check-out − 7 PM', () => {
    expect(ot(ist('2026-10-26', '19:15:00'))).not.toBe(15);
  });
});

describe('edge cases', () => {
  test('missing, invalid or impossible check-outs are never guessed', () => {
    expect(ot(null)).toBeNull();
    expect(ot(undefined)).toBeNull();
    expect(ot('not-a-date')).toBeNull();
    expect(ot(ist('2026-10-25', '21:00:00'))).toBeNull(); // before the attendance day
    expect(calculateOvertimeMinutes(null, ist('2026-10-26', '21:00:00'))).toBeNull();
    expect(calculateOvertimeMinutes('garbage', ist('2026-10-26', '21:00:00'))).toBeNull();
  });

  test('a missing check-in does not matter: only the recorded check-out counts', () => {
    expect(overtimeForRecord({ date: day('2026-10-26'), checkIn: null, checkOut: { timestamp: ist('2026-10-26', '20:00:00') } }, null, { overtimeEnabled: true }, TZ)).toBe(120);
  });

  test('a check-out after midnight keeps counting from 6 PM of the attendance day', () => {
    expect(ot(ist('2026-10-27', '00:30:00'))).toBe(390);
  });

  test('company timezone, not UTC or the browser: 7:15 PM IST is 13:45 UTC', () => {
    expect(ot(new Date('2026-10-26T13:45:00Z'))).toBe(75);
    expect(ot(new Date('2026-10-26T13:30:00Z'))).toBe(0); // 7:00 PM IST
  });

  test('month-end and year-end days', () => {
    expect(calculateOvertimeMinutes(day('2026-10-31'), ist('2026-10-31', '20:15:00'), { timeZone: TZ })).toBe(135);
    expect(calculateOvertimeMinutes(day('2026-12-31'), ist('2026-12-31', '19:01:00'), { timeZone: TZ })).toBe(61);
    expect(calculateOvertimeMinutes(day('2026-12-31'), ist('2027-01-01', '00:10:00'), { timeZone: TZ })).toBe(370);
  });

  test('overtime switched off in Office Settings → 0 (but an unknown check-out stays unknown)', () => {
    const rec = { date: day('2026-10-26'), checkOut: { timestamp: ist('2026-10-26', '21:00:00') } };
    expect(overtimeForRecord(rec, null, { overtimeEnabled: false }, TZ)).toBe(0);
    expect(overtimeForRecord({ date: day('2026-10-26'), checkOut: null }, null, { overtimeEnabled: false }, TZ)).toBeNull();
  });
});

describe('employee-specific pair (HR-set; e.g. Dubai)', () => {
  test('defaults for everyone; own threshold/start only where set', () => {
    expect(overtimeRuleFor(null)).toEqual({ threshold: '19:00', start: '18:00' });
    expect(overtimeRuleFor({ workingEndTime: '19:30' })).toEqual({ threshold: '19:00', start: '18:00' }); // end time alone changes nothing
    expect(overtimeRuleFor({ overtimeCutoffTime: '20:30', workingEndTime: '19:30' })).toEqual({ threshold: '20:30', start: '19:30' });
  });

  test('7 PM / 6 PM Dubai = 20:30 / 19:30 IST', () => {
    const dubai = { overtimeCutoffTime: '20:30', workingEndTime: '19:30' };
    const rec = (hms) => ({ date: day('2026-10-26'), checkOut: { timestamp: ist('2026-10-26', hms) } });
    expect(overtimeForRecord(rec('20:30:00'), dubai, { overtimeEnabled: true }, TZ)).toBe(0); // 7:00 PM Dubai
    expect(overtimeForRecord(rec('20:31:00'), dubai, { overtimeEnabled: true }, TZ)).toBe(61); // 7:01 PM Dubai
    expect(overtimeForRecord(rec('21:30:00'), dubai, { overtimeEnabled: true }, TZ)).toBe(120); // 8:00 PM Dubai
  });
});
