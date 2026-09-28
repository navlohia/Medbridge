/**
 * P23: in-memory Server-Sent Events hub (no new dependencies).
 * - One connection per tab, keyed by user id (a user with several tabs open
 *   holds several connections; events fan out to all of them).
 * - Events carry ONLY { type, ids, actor_name, summary } — never clinical
 *   payloads. Clients react by re-fetching through authorized endpoints.
 * - Heartbeat comment every HEARTBEAT_S (default 25s, env-overridable for
 *   tests) keeps proxies from buffering/closing the stream.
 */

const clients = new Map(); // userId -> Set<{ res, userId, role }>

// P26–P28: audience helpers (active accounts only).
function idsByRole(role) {
  // Lazy require avoids a circular import (database.js <-> routes is fine here
  // because events.js is only loaded after the DB module has initialized).
  const { db } = require('../db/database');
  return db.prepare("SELECT id FROM users WHERE role = ? AND is_active = 1").all(role).map(r => r.id);
}
function adminIds() { return idsByRole('admin'); }
function doctorIds() { return idsByRole('doctor'); }

function heartbeatMs() {
  const s = parseInt(process.env.HEARTBEAT_S || '25', 10);
  return (Number.isFinite(s) && s > 0 ? s : 25) * 1000;
}

function subscribe(userId, role, res) {
  if (!clients.has(userId)) clients.set(userId, new Set());
  const entry = { res, userId, role, lastSeen: Date.now() };
  clients.get(userId).add(entry);
  return () => unsubscribe(entry);
}

function unsubscribe(entry) {
  const set = clients.get(entry.userId);
  if (!set) return;
  set.delete(entry);
  if (set.size === 0) clients.delete(entry.userId);
}

/** Serialize one event to the SSE wire format. */
function formatSse(event) {
  return `event: medbridge\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Emit to a specific set of user ids. Unknown/closed ids are ignored.
 * emit({ type, ids: ['doc_1','adm_1'], actor_name, summary, ...ids })
 */
function emit({ type, ids, actor_name = null, summary = '', ...extra }) {
  if (!Array.isArray(ids) || ids.length === 0) return 0;
  const payload = formatSse({ type, actor_name, summary, ...extra, at: new Date().toISOString() });
  let delivered = 0;
  for (const userId of ids) {
    const set = clients.get(userId);
    if (!set) continue;
    for (const entry of set) {
      try {
        entry.res.write(payload);
        delivered++;
      } catch {
        unsubscribe(entry); // broken pipe — drop silently; the client reconnects
      }
    }
  }
  return delivered;
}

/** Start the heartbeat loop (single interval for all connections). */
let hbTimer = null;
function startHeartbeat() {
  if (hbTimer) return;
  hbTimer = setInterval(() => {
    const comment = `: heartbeat ${Date.now()}\n\n`;
    for (const set of clients.values()) {
      for (const entry of set) {
        try {
          entry.res.write(comment);
        } catch {
          unsubscribe(entry);
        }
      }
    }
  }, heartbeatMs());
  hbTimer.unref?.();
}

module.exports = { subscribe, unsubscribe, emit, startHeartbeat, adminIds, doctorIds };
