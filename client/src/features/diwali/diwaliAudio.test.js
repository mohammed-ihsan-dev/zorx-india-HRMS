import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDiwaliAudio, TRACKS, CHIRI_COOLDOWN_MS } from './diwaliAudio.js';

// Fake <audio>: records plays; "ends" when the test says so.
function harness() {
  const made = [];
  let clock = 1000;
  const timers = [];
  const createAudio = (src) => {
    const a = { src, paused: true, ended: false, currentTime: 0, volume: 1, muted: false, plays: 0,
      play() { this.plays += 1; this.paused = false; this.ended = false; return Promise.resolve(); },
      pause() { this.paused = true; } };
    made.push(a);
    return a;
  };
  const audio = createDiwaliAudio({ createAudio, now: () => clock, setTimer: (fn) => (timers.push(fn), timers.length), clearTimer: () => {} });
  const byName = (n) => made.find((a) => a.src === TRACKS[n]);
  const runTimers = () => { while (timers.length) timers.shift()(); };
  return { audio, made, byName, advance: (ms) => (clock += ms), runTimers, finish: (n) => { byName(n).paused = true; byName(n).ended = true; } };
}

test('uses exactly the four supplied files (as uploaded)', () => {
  assert.deepEqual(Object.values(TRACKS).sort(), ['/sounds/diwali/mg_adipookutty.mp3', '/sounds/diwali/mg_chiri.mp3', '/sounds/diwali/mg_full.mp3', '/sounds/diwali/mg_velmuruka.mp3']);
});

test('one reused element per track; a track never overlaps itself', () => {
  const h = harness();
  assert.equal(h.audio.play('full'), true);
  assert.equal(h.audio.play('full'), false); // still playing
  h.finish('full');
  assert.equal(h.audio.play('full'), true); // replay after it ended
  assert.equal(h.made.filter((a) => a.src === TRACKS.full).length, 1);
  assert.equal(h.byName('full').plays, 2);
});

test('chiri has a cooldown, so rapid taps never stack laughter', () => {
  const h = harness();
  assert.equal(h.audio.play('chiri'), true);
  h.finish('chiri');
  h.advance(300);
  assert.equal(h.audio.play('chiri'), false); // within the cooldown
  h.advance(CHIRI_COOLDOWN_MS);
  assert.equal(h.audio.play('chiri'), true);
});

test('starting a track fades out the others (velmuruka → full)', () => {
  const h = harness();
  h.audio.play('velmuruka');
  h.audio.play('full');
  h.runTimers();
  assert.equal(h.byName('velmuruka').paused, true);
  assert.equal(h.byName('full').paused, false);
});

test('mute stops everything and blocks playback; volume applies to all', () => {
  const h = harness();
  h.audio.play('full');
  h.audio.setMuted(true);
  assert.equal(h.byName('full').paused, true);
  assert.equal(h.audio.play('chiri'), false);
  h.audio.setMuted(false);
  h.audio.setVolume(0.3);
  assert.equal(h.audio.play('chiri'), true);
  assert.equal(h.byName('chiri').volume, 0.3);
  h.audio.setVolume(5);
  assert.equal(h.audio.volume, 1);
});

test('stopAll resets play states (Play Again); dispose makes it inert', () => {
  const h = harness();
  h.audio.play('chiri');
  h.audio.stopAll();
  assert.equal(h.audio.play('chiri'), true); // cooldown reset too
  h.audio.dispose();
  assert.equal(h.audio.play('full'), false);
  assert.ok(h.made.every((a) => a.paused));
});

test('failures never throw: no Audio support, or play() rejecting', async () => {
  const none = createDiwaliAudio({ createAudio: () => null });
  assert.equal(none.play('full'), false);
  const rejecting = createDiwaliAudio({ createAudio: () => ({ paused: true, ended: false, play: () => Promise.reject(new Error('NotAllowedError')), pause() {} }) });
  assert.doesNotThrow(() => rejecting.play('full'));
  assert.doesNotThrow(() => rejecting.unlock());
  const throwing = createDiwaliAudio({ createAudio: () => { throw new Error('boom'); } });
  assert.equal(throwing.play('chiri'), false);
});

test('a real cue during the silent iOS unlock is not cut off', async () => {
  const made = [];
  const createAudio = (src) => {
    const a = { src, paused: true, ended: false, currentTime: 0, volume: 1, muted: false,
      play() { this.paused = false; return Promise.resolve(); }, pause() { this.paused = true; } };
    made.push(a);
    return a;
  };
  const audio = createDiwaliAudio({ createAudio });
  audio.unlock(); // first tap: every element started muted
  assert.equal(audio.play('chiri'), true); // the same tap's laugh takes the element over
  const chiri = made.find((a) => a.src.endsWith('mg_chiri.mp3'));
  await Promise.resolve();
  await Promise.resolve(); // unlock's reset runs…
  assert.equal(chiri.muted, false);
  assert.equal(chiri.paused, false); // …and leaves the real laugh playing
});
