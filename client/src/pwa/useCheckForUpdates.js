import { useState } from 'react';
import { useAppUpdate } from './AppUpdateContext.jsx';
import { formatVersion, isNewBuild } from './updatePolicy.js';

/**
 * Menu → Check for Updates. Uses the same check as automatic updates; repeated
 * taps while one is running share it (the controller's check is single-flight).
 * state: 'idle' | 'checking' | 'current' | 'available' | 'error'
 */
export function useCheckForUpdates() {
  const { current, latest, pending, ready, blockedBy, check } = useAppUpdate();
  const [state, setState] = useState('idle');

  const run = async () => {
    if (state === 'checking') return;
    setState('checking');
    try {
      const manifest = await check();
      setState(isNewBuild(current.build, manifest) ? 'available' : 'current');
    } catch {
      setState('error');
    }
  };

  const currentLabel = formatVersion(current.version, current.build);
  const latestLabel = latest ? formatVersion(latest.version, latest.build) : '';
  // An update found by the background check counts as "available" too.
  const shown = state === 'idle' && pending ? 'available' : state;

  const message = {
    idle: { title: 'Check for Updates', detail: `Version ${currentLabel}` },
    checking: { title: 'Checking for updates…', detail: `Version ${currentLabel}` },
    current: { title: "You're up to date", detail: `Version ${currentLabel} is the latest version.` },
    available: {
      title: 'Update available',
      detail: `${latestLabel ? `${currentLabel} → ${latestLabel}. ` : ''}${
        !ready ? 'Downloading…' : blockedBy && blockedBy !== 'active' ? 'It will install when you finish what you’re doing.' : 'Installing…'
      }`,
    },
    error: { title: "Couldn't check for updates", detail: 'Please try again. Tap to retry.' },
  }[shown];

  return { state: shown, run, ...message };
}
