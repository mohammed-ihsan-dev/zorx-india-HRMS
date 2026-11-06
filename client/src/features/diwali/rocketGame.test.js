import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PHASE, LAYOUT, transition, toPx, canDrag, isLit } from './rocketGame.js';

const stage = { w: 400, h: 260 };
const at = (p, dx = 0, dy = 0) => { const q = toPx(p, stage.w, stage.h); return { x: q.x + dx, y: q.y + dy }; };
const run = (events, start = PHASE.READY) => events.reduce((ph, e) => transition(ph, { stage, ...e }), start);
const FLAME = at(LAYOUT.flame);
const PAD = at(LAYOUT.pad);
const MIDDLE = { x: 200, y: 130 };

test('the full happy path: pick up → light at the flame → return → launch → explode → complete', () => {
  let ph = PHASE.READY;
  ph = transition(ph, { type: 'grab', pos: PAD, stage }); assert.equal(ph, PHASE.LIGHTING);
  ph = transition(ph, { type: 'move', pos: MIDDLE, stage }); assert.equal(ph, PHASE.LIGHTING);
  ph = transition(ph, { type: 'move', pos: FLAME, stage }); assert.equal(ph, PHASE.LIT); // lit, but no launch
  ph = transition(ph, { type: 'move', pos: MIDDLE, stage }); assert.equal(ph, PHASE.RETURNING);
  ph = transition(ph, { type: 'drop', pos: PAD, stage }); assert.equal(ph, PHASE.LAUNCHING);
  ph = transition(ph, { type: 'launched' }); assert.equal(ph, PHASE.EXPLODING);
  ph = transition(ph, { type: 'exploded' }); assert.equal(ph, PHASE.COMPLETED);
  ph = transition(ph, { type: 'reset' }); assert.equal(ph, PHASE.READY);
});

test('an unlit rocket never launches, even when dropped on the pad', () => {
  assert.equal(run([{ type: 'grab', pos: PAD }, { type: 'move', pos: MIDDLE }, { type: 'drop', pos: PAD }]), PHASE.READY);
  assert.equal(run([{ type: 'grab', pos: PAD }, { type: 'drop', pos: MIDDLE }]), PHASE.READY); // springs back unlit
  assert.equal(run([{ type: 'launched' }, { type: 'exploded' }]), PHASE.READY); // out-of-order events do nothing
});

test('lighting does not launch: a lit rocket waits until it is placed back on the pad', () => {
  assert.equal(run([{ type: 'grab', pos: PAD }, { type: 'move', pos: FLAME }, { type: 'drop', pos: FLAME }]), PHASE.LIT);
  assert.equal(run([{ type: 'grab', pos: PAD }, { type: 'move', pos: FLAME }, { type: 'move', pos: MIDDLE }, { type: 'drop', pos: MIDDLE }]), PHASE.LIT);
  // ...and can be picked up again from where it rests.
  assert.equal(run([{ type: 'grab', pos: MIDDLE }, { type: 'drop', pos: at(LAYOUT.pad, 10, -8) }], PHASE.LIT), PHASE.LAUNCHING);
});

test('the pad and flame zones have edges', () => {
  assert.equal(run([{ type: 'grab' }, { type: 'move', pos: at(LAYOUT.flame, LAYOUT.flameRadius + 2, 0) }]), PHASE.LIGHTING);
  assert.equal(run([{ type: 'drop', pos: at(LAYOUT.pad, LAYOUT.padRadius + 2, 0) }], PHASE.RETURNING), PHASE.LIT);
});

test('no duplicate launches: during flight or the burst, grabs and drops are ignored', () => {
  for (const ph of [PHASE.LAUNCHING, PHASE.EXPLODING, PHASE.COMPLETED]) {
    for (const type of ['grab', 'move', 'drop']) assert.equal(transition(ph, { type, pos: PAD, stage }), ph);
    assert.equal(canDrag(ph), false);
  }
  assert.equal(transition(PHASE.LAUNCHING, { type: 'reset' }), PHASE.LAUNCHING); // replay only once completed
  assert.ok(isLit(PHASE.RETURNING) && !isLit(PHASE.READY) && !isLit(PHASE.LIGHTING));
});
