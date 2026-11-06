import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balanceTone } from './balanceTone.js';

test('Casual is green while any day is available (including carried-forward days), red at zero', () => {
  assert.equal(balanceTone('CASUAL', { available: 1 }), 'green');
  assert.equal(balanceTone('CASUAL', { available: 3 }), 'green');
  assert.equal(balanceTone('CASUAL', { available: 0 }), 'red');
});

test('Paid is always amber; eligible Sick follows availability like Casual; Sick before eligibility is neutral', () => {
  assert.equal(balanceTone('PAID', { allowance: null, used: 0 }), 'amber');
  assert.equal(balanceTone('SICK', { eligibleNow: true, available: 2 }), 'green');
  assert.equal(balanceTone('SICK', { eligibleNow: true, available: 0 }), 'red');
  assert.equal(balanceTone('SICK', { eligibleNow: false, available: 0 }), 'neutral');
});
