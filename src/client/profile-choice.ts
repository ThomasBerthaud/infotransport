import { useCallback, useEffect, useRef, useState } from 'react';
import {
  chooseProfile,
  profileById,
  type Config,
  type DevicePosition,
  type ProfileChoice,
} from '../shared/model.js';

// Chooses the profile shown by the detailed view on this device. The device position stays
// in memory: it is never sent to the server nor saved. Only profile ids are kept locally.

const MANUAL_KEY = 'infotransport.profile';
const LAST_KEY = 'infotransport.lastProfile';
/** The position is asked at most this often, on load and when the page becomes visible. */
const LOCATE_INTERVAL_MS = 5 * 60_000;
const GEOLOCATION_OPTIONS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10_000,
  maximumAge: 5 * 60_000,
};

/**
 * - `none`: no profile has a position, nothing is asked;
 * - `insecure`: the page is not served over HTTPS (or the API is missing);
 * - `denied`: the user refused; not asked again until « Automatique » is chosen again;
 * - `unavailable`: no position this time (timeout, no signal); retried later.
 */
export type LocationState = 'none' | 'insecure' | 'locating' | 'located' | 'denied' | 'unavailable';

const storage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // Private browsing: the choice lasts for this page only.
    }
  },
};

const geolocationUsable = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  typeof navigator !== 'undefined' &&
  'geolocation' in navigator;

export type ProfileSelection = {
  choice: ProfileChoice;
  /** Manually chosen profile, or null in automatic mode. */
  manualId: string | null;
  state: LocationState;
  /** Chooses a profile, or `null` to return to automatic mode (and ask the position again). */
  select: (id: string | null) => void;
};

export function useProfileChoice(config: Config): ProfileSelection {
  const [manualId, setManualId] = useState<string | null>(() => storage.get(MANUAL_KEY));
  const [position, setPosition] = useState<DevicePosition>();
  const located = config.profiles.length > 1 && config.profiles.some((p) => p.location);
  const usable = geolocationUsable();
  // Outcome of the last position request; the displayed state also depends on the config.
  const [outcome, setState] = useState<'locating' | 'located' | 'denied' | 'unavailable'>(
    'locating',
  );
  const state: LocationState = !located ? 'none' : !usable ? 'insecure' : outcome;
  const lastAttempt = useRef(0);
  const manual = profileById(config, manualId) ? manualId : null;
  const automatic = !manual && located && usable;

  const locate = useCallback((force = false) => {
    if (!force && Date.now() - lastAttempt.current < LOCATE_INTERVAL_MS) return;
    lastAttempt.current = Date.now();
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setPosition({ lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy });
        setState('located');
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setPosition(undefined);
          setState('denied');
        } else setState('unavailable');
      },
      GEOLOCATION_OPTIONS,
    );
  }, []);

  const denied = outcome === 'denied';
  useEffect(() => {
    if (!automatic || denied) return;
    locate();
    const onVisible = () => {
      if (document.visibilityState === 'visible') locate();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [automatic, denied, locate]);

  let choice: ProfileChoice;
  if (manual || position || !automatic || denied) choice = chooseProfile(config, position, manual);
  else {
    // Position not known yet: keep what this device showed last rather than flashing.
    const last = profileById(config, storage.get(LAST_KEY));
    choice = last ? { profile: last, reason: 'nearest' } : chooseProfile(config);
  }

  const shown = choice.profile.id;
  useEffect(() => {
    if (!manual) storage.set(LAST_KEY, shown);
  }, [manual, shown]);

  const select = useCallback(
    (id: string | null) => {
      storage.set(MANUAL_KEY, id);
      setManualId(id);
      if (id === null && located && usable) {
        setState('locating');
        locate(true);
      }
    },
    [locate, located, usable],
  );

  return { choice, manualId: manual, state, select };
}
