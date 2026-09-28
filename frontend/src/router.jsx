import { useState, useEffect } from 'react';

/**
 * Minimal history-API router (Round 2 Phase 99) — no new dependency, matching
 * the project's dependency-light convention. Three role areas: /doctor,
 * /patient, /admin, plus /login and a branded 404.
 */

export function usePath() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return path;
}

/** Soft-navigate without a page reload; back/forward works via popstate. */
export function navigate(to, { replace = false } = {}) {
  if (replace) {
    window.history.replaceState({}, '', to);
  } else {
    window.history.pushState({}, '', to);
  }
  // Notify usePath subscribers (same-origin popstate trick keeps one code path)
  window.dispatchEvent(new PopStateEvent('popstate'));
}

/** True when the current path is inside this top-level area. */
export function pathStartsWith(path, area) {
  return path === area || path.startsWith(area + '/');
}

/** Parse an id out of a deep link like /doctor/patient/pat_1 */
export function pathSegment(path, index) {
  return path.split('/').filter(Boolean)[index] || null;
}
