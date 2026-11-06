// Rules of the Diwali rocket game as a pure state machine (no DOM, no React),
// so every rule is unit-testable. The component only feeds it events.

export const PHASE = Object.freeze({
  READY: 'READY', // unlit, on its launch spot
  LIGHTING: 'LIGHTING', // unlit, being carried to the flame
  LIT: 'LIT', // fuse burning (resting, or still held at the flame)
  RETURNING: 'RETURNING', // lit, being carried back
  LAUNCHING: 'LAUNCHING', // flying up
  EXPLODING: 'EXPLODING', // burst in the sky
  COMPLETED: 'COMPLETED', // done; Play Again available
});

// Positions as fractions of the stage (pad bottom-left, flame right-middle).
export const LAYOUT = Object.freeze({
  pad: { x: 0.2, y: 0.74 },
  flame: { x: 0.8, y: 0.52 },
  flameRadius: 44, // px: rocket centre this close to the flame lights the fuse
  padRadius: 40, // px: lit rocket dropped this close to the pad launches
  burstY: 0.2, // explosion height (fraction from top)
});

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const toPx = (p, w, h) => ({ x: p.x * w, y: p.y * h });

/**
 * One transition. Events: { type: 'grab' | 'move' | 'drop' | 'launched' | 'exploded' | 'reset', pos?, stage? }.
 * `stage` = { w, h } in px. Unknown or out-of-order events leave the phase unchanged.
 */
export function transition(phase, event) {
  const { type, pos, stage } = event;
  const near = (target, radius) => pos && stage && distance(pos, toPx(target, stage.w, stage.h)) <= radius;
  switch (phase) {
    case PHASE.READY:
      return type === 'grab' ? PHASE.LIGHTING : phase;
    case PHASE.LIGHTING:
      if (type === 'move' && near(LAYOUT.flame, LAYOUT.flameRadius)) return PHASE.LIT; // ignition, still held
      if (type === 'drop') return near(LAYOUT.flame, LAYOUT.flameRadius) ? PHASE.LIT : PHASE.READY; // unlit: springs back
      return phase;
    case PHASE.LIT:
      if (type === 'grab') return PHASE.RETURNING;
      if (type === 'move' && !near(LAYOUT.flame, LAYOUT.flameRadius)) return PHASE.RETURNING; // carried away from the flame
      if (type === 'drop' && near(LAYOUT.pad, LAYOUT.padRadius)) return PHASE.LAUNCHING;
      return phase;
    case PHASE.RETURNING:
      if (type === 'drop') return near(LAYOUT.pad, LAYOUT.padRadius) ? PHASE.LAUNCHING : PHASE.LIT; // elsewhere: rests, still burning
      return phase;
    case PHASE.LAUNCHING:
      return type === 'launched' ? PHASE.EXPLODING : phase;
    case PHASE.EXPLODING:
      return type === 'exploded' ? PHASE.COMPLETED : phase;
    case PHASE.COMPLETED:
      return type === 'reset' ? PHASE.READY : phase;
    default:
      return PHASE.READY;
  }
}

export const isLit = (phase) => phase === PHASE.LIT || phase === PHASE.RETURNING || phase === PHASE.LAUNCHING;
export const canDrag = (phase) => phase === PHASE.READY || phase === PHASE.LIT;

export const HINTS = Object.freeze({
  READY: 'Drag the rocket to the flame to light it',
  LIGHTING: 'Bring the fuse to the flame…',
  LIT: 'Fuse lit! Place the rocket back on its launch spot',
  RETURNING: 'Place it on the glowing launch spot',
  LAUNCHING: 'Lift-off!',
  EXPLODING: '',
  COMPLETED: '',
});
