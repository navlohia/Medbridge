const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { subscribe, startHeartbeat } = require('../utils/events');

// Heartbeats run for the process lifetime; starting here keeps it lazy.
startHeartbeat();

/**
 * GET /api/events (P23) — authenticated Server-Sent Events stream.
 * EventSource cannot send headers, so the client uses fetch() streaming with
 * the Authorization header (P24). One stream per tab; cleanup on close.
 */
router.get('/events', authenticateToken, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    Connection: 'keep-alive'
  });
  res.flushHeaders?.();

  // Immediate confirmation so the client knows the stream is live.
  res.write(`: connected user=${req.user.id}\n\n`);

  const unsubscribe = subscribe(req.user.id, req.user.role, res);

  const close = () => {
    unsubscribe();
    try { res.end(); } catch { /* already closed */ }
  };
  req.on('close', close);
  res.on('close', close);
  req.on('error', close);
});

module.exports = router;
