/**
 * P24: fetch-streaming SSE client.
 * EventSource cannot send an Authorization header, so this reader uses fetch()
 * + ReadableStream with the session token, parses the `event: medbridge`
 * frames from the backend hub, and reconnects with exponential backoff.
 * Exactly ONE stream exists per browser tab (module singleton), closed on
 * logout — browsers cap ~6 HTTP/1.1 connections per origin across all tabs.
 */

let controller = null; // active AbortController (the single stream)
const activeControllers = new Set(); // every in-flight loop, so stopStream reaches all
let retries = 0;
let stopped = true;
let backoffTimer = null;
let listeners = new Map(); // type -> Set<handler>
let anyListeners = new Set();
let statusHandler = null;
let reconnectHandlers = new Set(); // P31: fired when a DROPPED stream recovers

function getToken() {
  return sessionStorage.getItem('medbridge_token');
}

function notifyStatus(status) {
  if (statusHandler) statusHandler(status);
}

function handleLineBuffer(buffer, isFinal) {
  // Parse complete SSE frames separated by \n\n
  let idx;
  const events = [];
  while ((idx = buffer.indexOf('\n\n')) !== -1) {
    const raw = buffer.slice(0, idx);
    const dataLines = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length) {
      try { events.push(JSON.parse(dataLines.join('\n'))); } catch { /* ignore bad frame */ }
    }
    buffer = buffer.slice(idx + 2);
  }
  return { rest: buffer, events };
}

function dispatch(event) {
  const handlers = listeners.get(event.type);
  if (handlers) for (const h of handlers) h(event);
  for (const h of anyListeners) h(event);
}

async function connectLoop() {
  while (!stopped) {
    const token = getToken();
    if (!token) { stopStream(); return; }
    // Each loop iteration owns its controller for its whole lifetime. Reading the
    // module-level `controller` here was unsound: under React.StrictMode the
    // double-mount aborts this loop's controller and immediately starts a new one,
    // so by the time the catch below ran, `controller` pointed at the REPLACEMENT
    // (not aborted) and `stopped` was false again — the exit test failed and this
    // loop ran forever beside the live one, duplicating every event and toast.
    const own = new AbortController();
    controller = own;
    activeControllers.add(own);
    let hadRetries = retries > 0;
    try {
      const res = await fetch('/api/events', {
        headers: { Authorization: `Bearer ${token}` },
        signal: own.signal
      });
      if (!res.ok || !res.body) throw new Error(`SSE HTTP ${res.status}`);

      retries = 0;
      notifyStatus('live');
      // P31: recovering from a drop → clients refetch everything.
      if (hadRetries) {
        hadRetries = false;
        for (const h of reconnectHandlers) {
          try { h(); } catch { /* handler errors never kill the stream */ }
        }
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { rest, events } = handleLineBuffer(buffer);
        buffer = rest;
        for (const ev of events) dispatch(ev);
      }
      // Server closed the stream — treat as a drop and reconnect.
      throw new Error('stream closed');
    } catch (err) {
      if (stopped || own.signal.aborted) return; // intentional close
      retries++;
      notifyStatus('connecting');
      const delay = Math.min(500 * 2 ** (retries - 1), 8000);
      await new Promise(r => { backoffTimer = setTimeout(r, delay); });
      if (stopped) return;
    } finally {
      activeControllers.delete(own);
      if (controller === own) controller = null;
    }
  }
}

export function startStream() {
  if (!stopped && controller) return; // already running (ONE stream per tab)
  stopped = false;
  retries = 0;
  connectLoop();
}

export function stopStream() {
  stopped = true;
  if (backoffTimer) { clearTimeout(backoffTimer); backoffTimer = null; }
  // Abort every in-flight loop, not just the newest one, so an orphan can never
  // survive a teardown.
  for (const c of activeControllers) { try { c.abort(); } catch { /* noop */ } }
  activeControllers.clear();
  controller = null;
  notifyStatus('offline');
}

export function onRealtimeEvent(type, handler) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(handler);
  return () => listeners.get(type)?.delete(handler);
}

export function onAnyRealtimeEvent(handler) {
  anyListeners.add(handler);
  return () => anyListeners.delete(handler);
}

export function onStreamStatus(handler) {
  statusHandler = handler;
  return () => { if (statusHandler === handler) statusHandler = null; };
}

/** P31: subscribe to reconnect-after-drop notifications (refetch-all). */
export function onStreamReconnect(handler) {
  reconnectHandlers.add(handler);
  return () => reconnectHandlers.delete(handler);
}
