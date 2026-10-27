import { test } from 'node:test';
import assert from 'node:assert/strict';
import { breakTimeLeft, BREAK_TONE } from './breakTimeLeft.js';
import { breakAllowanceUsage } from './breakReminders.js';

const left = (usedMinutes) => breakTimeLeft(60, (60 - usedMinutes) * 60);

test('colour, minutes and width at each threshold of the 60-minute allowance', () => {
  const cases = [
    [0, BREAK_TONE.GREEN, 60, 100],
    [29, BREAK_TONE.GREEN, 31, (31 / 60) * 100],
    [30, BREAK_TONE.ORANGE, 30, 50],
    [31, BREAK_TONE.ORANGE, 29, (29 / 60) * 100],
    [49, BREAK_TONE.ORANGE, 11, (11 / 60) * 100],
    [50, BREAK_TONE.RED, 10, (10 / 60) * 100],
    [59, BREAK_TONE.RED, 1, (1 / 60) * 100],
    [60, BREAK_TONE.EXHAUSTED, 0, 0],
  ];
  for (const [used, tone, minutes, percent] of cases) {
    const r = left(used);
    assert.equal(r.tone, tone, `tone at ${used} min used`);
    assert.equal(r.remainingMinutes, minutes, `minutes left at ${used} min used`);
    assert.ok(Math.abs(r.percent - percent) < 1e-9, `width at ${used} min used`);
  }
});

test('just under a threshold stays in the lower band; seconds left round up', () => {
  assert.equal(breakTimeLeft(60, 30 * 60 + 1).tone, BREAK_TONE.GREEN); // 29m59s used
  assert.equal(breakTimeLeft(60, 10 * 60 + 1).tone, BREAK_TONE.ORANGE); // 49m59s used
  assert.equal(breakTimeLeft(60, 30).remainingMinutes, 1); // 30 s left is not "0 min"
});

test('never negative or over-full, whatever the input', () => {
  assert.deepEqual(breakTimeLeft(60, -500), { tone: BREAK_TONE.EXHAUSTED, remainingMinutes: 0, percent: 0 });
  assert.equal(breakTimeLeft(60, 99999).percent, 100);
  assert.equal(breakTimeLeft(60, undefined).tone, BREAK_TONE.EXHAUSTED);
});

test('follows a configured allowance instead of a hard-coded 60', () => {
  assert.equal(breakTimeLeft(90, 45 * 60).tone, BREAK_TONE.ORANGE); // half used
  assert.equal(breakTimeLeft(90, 15 * 60).tone, BREAK_TONE.RED); // 75 of 90 used
  assert.equal(breakTimeLeft(90, 90 * 60).remainingMinutes, 90);
});

test('multiple completed breaks plus an active one are summed (same calculation as End Break)', () => {
  const t = (hhmm) => `2026-10-27T${hhmm}:00+05:30`;
  const record = {
    breaks: [
      { startTime: t('11:00'), endTime: t('11:10') },
      { startTime: t('13:00'), endTime: t('13:20') },
      { startTime: t('16:00'), endTime: null },
    ],
  };
  const at = (hhmm) => breakAllowanceUsage(record, Date.parse(t(hhmm)), 60).remainingMs / 1000;
  assert.equal(breakTimeLeft(60, at('16:00')).tone, BREAK_TONE.ORANGE); // 30 used
  assert.equal(breakTimeLeft(60, at('16:05')).remainingMinutes, 25); // 35 used, ticking
  assert.equal(breakTimeLeft(60, at('16:20')).tone, BREAK_TONE.RED); // 50 used
  assert.equal(breakTimeLeft(60, at('16:45')).tone, BREAK_TONE.EXHAUSTED); // over: never negative
});
