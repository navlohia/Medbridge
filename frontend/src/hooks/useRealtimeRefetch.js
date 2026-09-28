import { useEffect, useRef } from 'react';
import { useAnyRealtimeEvent } from '../realtime/RealtimeProvider';

/**
 * P29: realtime → flashless refetch bridge.
 * `handlers` maps event types to refetch functions, e.g.
 *   useRealtimeRefetch({ 'appointment.updated': loadAppointments, ... })
 * The page keeps its OLD data on screen while the refetch runs; when the new
 * data lands it swaps in via normal setState. No loading=true is set on this
 * path, so skeletons never flash. One refetch per event type per tick — the
 * latest call wins (idempotent GETs).
 */
export default function useRealtimeRefetch(handlers) {
  const ref = useRef(handlers);
  ref.current = handlers;

  useAnyRealtimeEvent((event) => {
    const fn = ref.current?.[event.type];
    if (typeof fn === 'function') {
      try {
        fn(event);
      } catch (err) {
        console.error('[realtime refetch]', event.type, err);
      }
    }
  });
}
