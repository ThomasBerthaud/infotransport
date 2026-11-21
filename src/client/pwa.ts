import { useSyncExternalStore } from 'react';

// Service worker registration for the rich view. Development builds skip it so Vite's
// module reloading is never served from a cache.
let updated = false;
const listeners = new Set<() => void>();

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  // The first installation also takes control: that is not a new version.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || updated) return;
    updated = true;
    for (const listener of listeners) listener();
  });
  void navigator.serviceWorker.register('/sw.js').catch(() => {
    // Without a service worker the page still works online.
  });
}

/** True once a new version took over: assets already loaded belong to the previous one. */
export function useUpdateAvailable() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => updated,
  );
}
