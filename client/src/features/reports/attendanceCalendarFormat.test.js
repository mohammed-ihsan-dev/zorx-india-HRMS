import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STATUS_TONE, LEGEND, toneFor, summaryItems } from './attendanceCalendarFormat.js';

test('the five required colours, and Present keeps the normal background', () => {
  assert.match(toneFor('LATE'), /yellow/);
  assert.match(toneFor('HALF_DAY'), /orange/);
  assert.match(toneFor('SICK_LEAVE'), /slate/); // grey
  assert.match(toneFor('CASUAL_LEAVE'), /purple/);
  assert.match(toneFor('ABSENT'), /red/);
  assert.equal(toneFor('PRESENT'), 'bg-white');
});

test('the five status colours are all different, and the legend uses the same classes', () => {
  const five = ['LATE', 'HALF_DAY', 'SICK_LEAVE', 'CASUAL_LEAVE', 'ABSENT'].map(toneFor);
  assert.equal(new Set(five).size, 5);
  for (const item of LEGEND) assert.ok(STATUS_TONE[item.status], item.status);
  assert.deepEqual(LEGEND.slice(0, 5).map((l) => l.label), ['Late', 'Half Day', 'Sick Leave', 'Casual Leave', 'Absent']);
});

test('summary lists only working statuses that occurred, in reading order', () => {
  assert.deepEqual(summaryItems({ PRESENT: 18, ABSENT: 1, WEEKLY_OFF: 4, LATE: 0 }).map((i) => `${i.label} ${i.count}`), ['Present 18', 'Absent 1']);
});
