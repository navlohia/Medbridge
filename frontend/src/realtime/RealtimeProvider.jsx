import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  startStream,
  stopStream,
  onRealtimeEvent,
  onAnyRealtimeEvent,
  onStreamStatus
} from './sseClient';

/**
 * P25: RealtimeProvider — owns the single SSE stream for this tab (started on
 * login, closed on logout), exposes useRealtime(types, handler) for flashless
 * refetch wiring (P29–P32), and the connection status for the header dot.
 */

const RealtimeContext = createContext({ status: 'offline' });

export function RealtimeProvider({ children }) {
  const { user } = useAuth();
  const [status, setStatus] = useState('offline');

  // Exactly one stream per tab.
  useEffect(() => {
    if (user) {
      startStream();
    } else {
      stopStream();
    }
    return () => stopStream();
  }, [user?.id]);

  useEffect(() => onStreamStatus(setStatus), []);

  return (
    <RealtimeContext.Provider value={{ status }}>
      {children}
    </RealtimeContext.Provider>
  );
}

/**
 * useRealtime(types, handler) — subscribe for the lifetime of the component.
 * `types` is a string or array of strings; the handler receives
 * { type, ids, actor_name, summary, at }. Handlers are kept in a ref so
 * consumers can pass inline closures without resubscribing.
 */
export function useRealtime(types, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  const key = Array.isArray(types) ? types.join('|') : types;

  useEffect(() => {
    const list = Array.isArray(types) ? types : [types];
    const unsubs = list.map(t => onRealtimeEvent(t, (ev) => ref.current(ev)));
    return () => unsubs.forEach(u => u());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** Subscribe to every event regardless of type. */
export function useAnyRealtimeEvent(handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => onAnyRealtimeEvent((ev) => ref.current(ev)), []);
}

/** "live" | "connecting" | "offline" for the header indicator. */
export function useRealtimeStatus() {
  return useContext(RealtimeContext).status;
}

/** Small green/grey dot + label for the header (P25). */
export function LiveIndicator() {
  const status = useRealtimeStatus();
  const cfg = {
    live: { dot: 'bg-success-text', label: 'Live', title: 'Real-time updates connected' },
    connecting: { dot: 'bg-warning-text animate-pulse', label: 'Connecting…', title: 'Reconnecting to real-time updates' },
    offline: { dot: 'bg-primary-300', label: 'Offline', title: 'Real-time updates not connected' }
  }[status] || { dot: 'bg-primary-300', label: 'Offline', title: 'Real-time updates not connected' };

  return (
    <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-semibold text-primary-500" title={cfg.title}>
      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

export default RealtimeProvider;
