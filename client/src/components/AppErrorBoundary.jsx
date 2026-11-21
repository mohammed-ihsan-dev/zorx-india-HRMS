import { Component } from 'react';

const RELOAD_KEY = 'zorx_chunk_reload_at';
// A page's code failed to download: connection dropped, or the app was updated
// and the old file names are gone. A single reload fixes the latter.
export const isChunkLoadError = (error) =>
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk .* failed/i.test(String(error?.message || error));

/**
 * Last line of defence: an error while rendering never leaves a blank screen.
 * A failed code download reloads the app once by itself (not in a loop); anything
 * else shows a clear message with a Reload button. The session survives a reload.
 */
export class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (!isChunkLoadError(error)) return;
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last > 60_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
      }
    } catch {
      // storage blocked: show the message below instead of risking a reload loop
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return (
      <div role="alert" className="zm-loading-surface min-h-screen flex flex-col items-center justify-center gap-4 bg-white px-4 text-center">
        <p className="text-base font-semibold text-slate-800">
          {isChunkLoadError(error) ? 'Part of the app could not be loaded.' : 'Something went wrong on this screen.'}
        </p>
        <p className="text-sm text-slate-500">
          {offline ? 'You appear to be offline. Reconnect, then reload.' : 'Reloading usually fixes it. You will stay signed in.'}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center justify-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Reload
        </button>
      </div>
    );
  }
}
