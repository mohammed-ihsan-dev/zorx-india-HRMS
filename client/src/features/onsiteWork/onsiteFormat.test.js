import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatOnsiteDate, onsiteDateInputValue, validateOnsiteForm } from './onsiteFormat.js';

const form = (over = {}) => ({ date: '2026-11-10', reason: 'Videography', workLocation: 'Dubai Marina', description: '', ...over });

test('shows the stored day regardless of the viewer timezone', () => {
  assert.equal(formatOnsiteDate('2026-11-10T00:00:00.000Z'), '10 Nov 2026');
  assert.equal(onsiteDateInputValue('2026-11-10T00:00:00.000Z'), '2026-11-10');
  assert.equal(formatOnsiteDate(null), '—');
});

test('validates required fields and past dates like the server', () => {
  assert.equal(validateOnsiteForm(form(), '2026-11-05'), '');
  assert.equal(validateOnsiteForm(form({ date: '2026-11-05' }), '2026-11-05'), ''); // today is allowed
  assert.match(validateOnsiteForm(form({ date: '2026-11-04' }), '2026-11-05'), /past date/);
  assert.match(validateOnsiteForm(form({ date: '' }), '2026-11-05'), /select a date/);
  assert.match(validateOnsiteForm(form({ reason: ' ' }), '2026-11-05'), /reason/);
  assert.match(validateOnsiteForm(form({ workLocation: '' }), '2026-11-05'), /location/);
});
