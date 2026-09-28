import { useEffect } from 'react';
import { onStreamReconnect } from '../realtime/sseClient';

/**
 * P31: after the SSE stream drops and recovers, refetch everything once.
 * Pass any number of reload functions; they run without setting loading=true
 * (flashless). Deduplicates multiple recoveries in the same second.
 */
export default function useReconnectRefetch(reloadFns) {
  useEffect(() => {
    let lastFire = 0;
    return onStreamReconnect(() => {
      const now = Date.now();
      if (now - lastFire < 1000) return; // one refetch sweep per second max
      lastFire = now;
      for (const fn of reloadFns) {
        try { fn(); } catch { /* keep going */ }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
