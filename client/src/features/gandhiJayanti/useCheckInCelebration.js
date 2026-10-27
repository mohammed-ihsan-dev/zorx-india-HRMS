import { useCallback, useEffect, useRef } from 'react';
import {
  isGandhiJayantiToday,
  hasCelebratedThisSession,
  markCelebratedThisSession,
  resetCelebratedThisSession,
  triggerGandhiCelebration,
} from './gandhiJayantiConfig.js';

/**
 * Gandhi Jayanti celebration trigger — observes genuine check-in success and
 * triggers the shared celebration. Never touches the attendance logic itself.
 * Only a transition from "no check-in" to "has check-in" directly preceded by a
 * click on Check In counts — never the initial fetch revealing an existing one.
 */
export function useCheckInCelebration(record) {
  const checkInAttemptedRef = useRef(false);
  const hadCheckInRef = useRef(Boolean(record?.checkIn));

  useEffect(() => {
    const hasCheckInNow = Boolean(record?.checkIn);
    if (checkInAttemptedRef.current && !hadCheckInRef.current && hasCheckInNow) {
      if (isGandhiJayantiToday() && !hasCelebratedThisSession()) {
        markCelebratedThisSession();
        triggerGandhiCelebration();
      }
    }
    checkInAttemptedRef.current = false;
    hadCheckInRef.current = hasCheckInNow;
  }, [record]);

  const markCheckInAttempt = useCallback(() => {
    checkInAttemptedRef.current = true;
  }, []);

  const resetForTestUser = useCallback(() => {
    hadCheckInRef.current = false;
    checkInAttemptedRef.current = false;
    resetCelebratedThisSession();
  }, []);

  return { markCheckInAttempt, resetForTestUser };
}
