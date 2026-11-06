// Audio for the Diwali game: the four supplied tracks, one reused element each.
// - a track never overlaps itself; "chiri" also has a cooldown (no laughter spam);
// - starting a track fades out whatever else is playing (no stacking);
// - mute / volume apply to everything;
// - failures (missing file, autoplay refusal) are swallowed — the game never breaks.
// Pure logic with an injectable `createAudio`, so it is unit-testable without a browser.

export const TRACKS = Object.freeze({
  unlock: '/sounds/diwali/mg_adipookutty.mp3', // five diyas lit (file name as uploaded)
  chiri: '/sounds/diwali/mg_chiri.mp3', // locked / incorrect interaction
  velmuruka: '/sounds/diwali/mg_velmuruka.mp3', // lit rocket placed on the launch spot
  full: '/sounds/diwali/mg_full.mp3', // firework celebration
});

export const CHIRI_COOLDOWN_MS = 1500;
const FADE_MS = 300;

const defaultCreateAudio = (src) => {
  if (typeof Audio === 'undefined') return null;
  const a = new Audio(src);
  a.preload = 'auto';
  return a;
};

export function createDiwaliAudio({ createAudio = defaultCreateAudio, now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const els = {};
  const lastStart = {};
  const fades = new Set();
  let muted = false;
  let volume = 0.8;
  let unlocked = false;
  let disposed = false;

  const el = (name) => {
    if (disposed || !TRACKS[name]) return null;
    if (!(name in els)) {
      try {
        els[name] = createAudio(TRACKS[name]);
        if (els[name]) els[name].volume = volume;
      } catch {
        els[name] = null;
      }
    }
    return els[name];
  };
  const isPlaying = (a) => Boolean(a) && !a.paused && !a.ended;
  const safePlay = (a) => {
    try {
      const p = a.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch {
      // ignore: playback refused or unsupported
    }
  };
  const stop = (a) => {
    try {
      a.pause();
      a.currentTime = 0;
    } catch {
      // ignore
    }
  };
  // Quick fade-out (no abrupt cut) — a few steps, then stop and restore volume.
  const fadeOut = (a) => {
    if (!isPlaying(a)) return;
    const steps = 5;
    let i = 0;
    const tick = () => {
      i += 1;
      try {
        a.volume = Math.max(0, volume * (1 - i / steps));
      } catch {
        // ignore
      }
      if (i >= steps) {
        stop(a);
        try {
          a.volume = volume;
        } catch {
          // ignore
        }
        fades.delete(t);
        return;
      }
      t = setTimer(tick, FADE_MS / steps);
      fades.add(t);
    };
    let t = setTimer(tick, FADE_MS / steps);
    fades.add(t);
  };

  return {
    /** Create the elements early (after the first tap) so later cues start instantly. */
    preload() {
      Object.keys(TRACKS).forEach(el);
    },
    /**
     * Call from the first user gesture: iOS/Safari only allow later scripted
     * playback (e.g. the firework cue) for elements started inside a gesture.
     */
    unlock() {
      if (unlocked || disposed) return;
      unlocked = true;
      for (const name of Object.keys(TRACKS)) {
        const a = el(name);
        if (!a) continue;
        try {
          a.muted = true;
          const p = a.play();
          // Only undo our own silent start: if a real cue took the element over meanwhile, leave it playing.
          const reset = () => {
            try {
              if (!a.muted) return;
              a.pause();
              a.currentTime = 0;
              a.muted = false;
            } catch {
              // ignore
            }
          };
          if (p && typeof p.then === 'function') p.then(reset, reset);
          else reset();
        } catch {
          // ignore
        }
      }
    },
    /** Plays `name` once. Returns true if it started (false: muted, already playing, cooling down, unavailable). */
    play(name) {
      if (disposed || muted) return false;
      const a = el(name);
      if (!a) return false;
      if (isPlaying(a) && !a.muted) return false; // never two copies (a silent unlock start doesn't count)
      if (name === 'chiri' && lastStart.chiri && now() - lastStart.chiri < CHIRI_COOLDOWN_MS) return false;
      for (const other of Object.keys(els)) if (other !== name) fadeOut(els[other]);
      lastStart[name] = now();
      try {
        a.muted = false; // takes over from a silent unlock start, if any
        a.currentTime = 0;
        a.volume = volume;
      } catch {
        // ignore
      }
      safePlay(a);
      return true;
    },
    stopAll() {
      for (const t of fades) clearTimer(t);
      fades.clear();
      for (const a of Object.values(els)) if (a) stop(a);
      for (const k of Object.keys(lastStart)) delete lastStart[k];
    },
    setMuted(value) {
      muted = Boolean(value);
      if (muted) this.stopAll();
    },
    setVolume(value) {
      volume = Math.min(1, Math.max(0, Number(value) || 0));
      for (const a of Object.values(els)) {
        try {
          if (a) a.volume = volume;
        } catch {
          // ignore
        }
      }
    },
    get muted() {
      return muted;
    },
    get volume() {
      return volume;
    },
    /** Stop everything and release the elements (game closed). */
    dispose() {
      this.stopAll();
      disposed = true;
      for (const a of Object.values(els)) {
        try {
          if (a) {
            a.removeAttribute?.('src');
            a.load?.();
          }
        } catch {
          // ignore
        }
      }
    },
  };
}
