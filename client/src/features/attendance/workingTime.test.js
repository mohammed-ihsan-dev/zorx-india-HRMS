import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netWorkedMinutes, breakMinutesSoFar, requiredWorkingMinutes, progressPercent } from './workingTime.js';
import { formatMinutes } from '../../utils/formatters.js';

const at = (hhmm) => `2026-10-16T${hhmm}:00+05:30`;
const ms = (hhmm) => new Date(at(hhmm)).getTime();
const OFFICE = { workingStartTime: '09:30', workingEndTime: '18:00', breakDurationMinutes: 60 };
const lunch = { startTime: at('13:00'), endTime: at('14:00'), durationMinutes: 60 };

test('target is 7h 30m (office 09:30–18:00 minus the 1h break)', () => {
  assert.equal(requiredWorkingMinutes(OFFICE), 450);
  assert.equal(formatMinutes(requiredWorkingMinutes(OFFICE)), '7h 30m');
  assert.equal(requiredWorkingMinutes(null), null);
});

test('full standard day 09:30–18:00 with a 1h break → 7h 30m, 100%', () => {
  // As stored by the backend at checkout (already net of breaks).
  const stored = { checkIn: { timestamp: at('09:30') }, checkOut: { timestamp: at('18:00') }, breaks: [lunch], totalWorkingMinutes: 450 };
  assert.equal(netWorkedMinutes(stored), 450);
  assert.equal(formatMinutes(netWorkedMinutes(stored)), '7h 30m');
  assert.equal(progressPercent(450, 450), 100);
  // Fallback if the stored total were missing: computed from the timestamps, break removed once.
  const { totalWorkingMinutes, ...noTotal } = stored;
  assert.equal(totalWorkingMinutes, 450);
  assert.equal(netWorkedMinutes(noTotal), 450);
});

test('stored net total is used as-is — the break is not subtracted a second time', () => {
  const r = { checkIn: { timestamp: at('09:30') }, checkOut: { timestamp: at('18:00') }, breaks: [lunch], totalWorkingMinutes: 450 };
  assert.notEqual(netWorkedMinutes(r), 390);
});

test('shorter session with no break taken → actual time, no blanket 1h deduction', () => {
  const r = { checkIn: { timestamp: at('09:30') }, checkOut: { timestamp: at('13:30') }, breaks: [], totalWorkingMinutes: 240 };
  assert.equal(netWorkedMinutes(r), 240);
  assert.equal(formatMinutes(netWorkedMinutes(r)), '4h 00m');
  assert.ok(Math.abs(progressPercent(240, 450) - 53.33) < 0.01);
});

test('recorded breaks (several) are each excluded exactly once', () => {
  const breaks = [lunch, { startTime: at('16:00'), endTime: at('16:15'), durationMinutes: 15 }];
  assert.equal(breakMinutesSoFar(breaks, ms('18:00')), 75);
  const r = { checkIn: { timestamp: at('09:30') }, checkOut: { timestamp: at('18:00') }, breaks };
  assert.equal(netWorkedMinutes(r), 510 - 75);
});

test('active check-in, before any break → elapsed time so far', () => {
  const r = { checkIn: { timestamp: at('09:30') }, checkOut: null, breaks: [] };
  assert.equal(netWorkedMinutes(r, ms('12:45')), 195);
});

test('active check-in after lunch → elapsed minus the completed break', () => {
  const r = { checkIn: { timestamp: at('09:30') }, checkOut: null, breaks: [lunch] };
  assert.equal(netWorkedMinutes(r, ms('15:00')), 270); // 5h30 elapsed − 1h
  assert.equal(formatMinutes(netWorkedMinutes(r, ms('18:00'))), '7h 30m');
});

test('on an active break the clock pauses', () => {
  const r = { checkIn: { timestamp: at('09:30') }, checkOut: null, breaks: [{ startTime: at('13:00'), endTime: null, durationMinutes: 0 }] };
  assert.equal(netWorkedMinutes(r, ms('13:00')), 210);
  assert.equal(netWorkedMinutes(r, ms('13:40')), 210);
});

test('no attendance record / no check-in → 0 and 0%', () => {
  assert.equal(netWorkedMinutes(null), 0);
  assert.equal(netWorkedMinutes({ checkIn: null }), 0);
  assert.equal(progressPercent(0, 450), 0);
});

test('never negative or out-of-range; bad timestamps are safe', () => {
  assert.equal(netWorkedMinutes({ checkIn: { timestamp: at('10:00') }, checkOut: null, breaks: [] }, ms('09:00')), 0); // clock skew
  assert.equal(netWorkedMinutes({ checkIn: { timestamp: 'not-a-date' }, checkOut: null }), 0);
  assert.equal(netWorkedMinutes({ checkIn: { timestamp: at('09:30') }, checkOut: { timestamp: 'bad' }, breaks: [] }), 0);
  assert.equal(netWorkedMinutes({ checkIn: { timestamp: at('09:30') }, checkOut: { timestamp: at('18:00') }, totalWorkingMinutes: -5 }), 0);
  // A break longer than the session cannot push the total below zero.
  assert.equal(netWorkedMinutes({ checkIn: { timestamp: at('09:30') }, checkOut: null, breaks: [{ startTime: at('08:00'), endTime: at('12:00') }] }, ms('10:00')), 0);
  assert.equal(breakMinutesSoFar([{ startTime: at('14:00'), endTime: at('13:00') }, { startTime: null }], ms('18:00')), 0);
  assert.equal(progressPercent(900, 450), 100);
  assert.equal(progressPercent(-10, 450), 0);
  assert.equal(progressPercent(100, 0), 0);
  assert.equal(progressPercent(NaN, 450), 0);
});

test('overnight session (check-out after midnight) is counted correctly', () => {
  const r = { checkIn: { timestamp: '2026-10-16T21:00:00+05:30' }, checkOut: { timestamp: '2026-10-17T01:00:00+05:30' }, breaks: [] };
  assert.equal(netWorkedMinutes(r), 240);
});

test('format is consistent: 6h 45m, 7h 30m, 8h 00m', () => {
  assert.deepEqual([405, 450, 480].map(formatMinutes), ['6h 45m', '7h 30m', '8h 00m']);
});

test('office (IST) schedule times shown in the viewer\'s own timezone', async () => {
  const { officeClockToLocal } = await import('./workingTime.js');
  const day = new Date('2026-11-02T06:00:00Z');
  assert.equal(officeClockToLocal('11:30', 'Asia/Kolkata', day, 'Asia/Dubai'), '10:00 am');
  assert.equal(officeClockToLocal('19:30', 'Asia/Kolkata', day, 'Asia/Dubai'), '06:00 pm');
  assert.equal(officeClockToLocal('20:30', 'Asia/Kolkata', day, 'Asia/Dubai'), '07:00 pm');
  assert.equal(officeClockToLocal('09:30', 'Asia/Kolkata', day, 'Asia/Kolkata'), '09:30 am'); // India staff: unchanged
  assert.equal(officeClockToLocal('18:00', 'Asia/Kolkata', day, 'Asia/Kolkata'), '06:00 pm');
  assert.equal(officeClockToLocal('', 'Asia/Kolkata', day, 'Asia/Dubai'), '');
});
