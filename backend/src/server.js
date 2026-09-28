require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initSchema, runMigrations } = require('./db/database');

const authRoutes = require('./routes/auth');
const medicineRoutes = require('./routes/medicines');
const diagnosisRoutes = require('./routes/diagnoses');
const labTestRoutes = require('./routes/labTests');
const visitRoutes = require('./routes/visits');
const patientRoutes = require('./routes/patients');
const selfLogRoutes = require('./routes/selfLogs');
const appointmentRoutes = require('./routes/appointments');
const doctorRoutes = require('./routes/doctors');
const adminRoutes = require('./routes/admin');
const labReportRoutes = require('./routes/labReports');
const eventRoutes = require('./routes/events');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize database schema if not already initialized, then apply incremental migrations
initSchema();
runMigrations();

// Middlewares
// P37: CORS limited to env ALLOWED_ORIGINS (comma-separated). Defaults cover
// the two local dev/single-port origins; PATCH is included for cancel/status.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:5000')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow same-origin/no-origin tools (curl, health checks) and listed origins.
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(null, false); // disallowed origins get no CORS headers
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// P20: uploaded lab-report images are NO LONGER public static files.
// They are served only through GET /api/lab-reports/image/:name, which enforces
// authentication (owning patient or any doctor). LAB_REPORT_UPLOADS_DIR is
// still referenced by the lab-reports router.

// Request logger for debugging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString().split('T')[1].slice(0, 8)}] ${req.method} ${req.url}`);
  next();
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'MedBridge API', timestamp: new Date().toISOString() });
});
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'MedBridge API', timestamp: new Date().toISOString() });
});

// Mount Routes (supporting both /api/path and /path)
const mountRouters = (prefix = '') => {
  app.use(`${prefix}/auth`, authRoutes);
  app.use(`${prefix}/medicines`, medicineRoutes);
  app.use(`${prefix}/diagnoses`, diagnosisRoutes);
  app.use(`${prefix}/lab-tests`, labTestRoutes);
  app.use(`${prefix}/visits`, visitRoutes);
  app.use(`${prefix}/patients`, patientRoutes);
  app.use(`${prefix}/self-logs`, selfLogRoutes);
  app.use(`${prefix}/appointments`, appointmentRoutes);
  app.use(`${prefix}/doctors`, doctorRoutes);
  app.use(`${prefix}/admin`, adminRoutes);
  app.use(`${prefix}/lab-reports`, labReportRoutes);
  app.use(`${prefix}`, eventRoutes);
};

// P35: single-port mode — serve the built frontend (frontend/dist) with an
// SPA fallback so `npm run build && npm start` runs everything on :5000.
const DIST_DIR = path.join(__dirname, '..', '..', 'frontend', 'dist');
const HAS_DIST = fs.existsSync(DIST_DIR);

function serveSpa(req, res) {
  return res.sendFile(path.join(DIST_DIR, 'index.html'));
}

mountRouters('/api');

// Single-port fix: the bare mount below would claim the frontend's own `/admin`
// route (admin.js runs `router.use(authenticateToken)` for every request that
// enters it), so refreshing or deep-linking /admin returned 401 instead of the
// app. A real browser navigation is the only request that must skip the bare
// API mount and fall through to the SPA below.
//
// The discriminator is an explicit `text/html` in Accept: browsers send it on
// navigation, while fetch()/XHR and curl send `*/*` or a specific type. Using
// req.accepts('html') here would be WRONG — it also matches `*/*` and would
// break every bare API call and every static asset request.
app.use((req, res, next) => {
  const accept = req.headers.accept || '';
  const isNavigation = accept.includes('text/html');
  if (HAS_DIST && req.method === 'GET' && isNavigation && !req.path.startsWith('/api/')) {
    return serveSpa(req, res);
  }
  next();
});

mountRouters('');

if (HAS_DIST) {
  app.use(express.static(DIST_DIR, { index: 'index.html', maxAge: '1h', setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } }));
  app.get('*', (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  console.warn('[server] frontend/dist not found — single-port mode unavailable (run `npm run build`).');
}

// Global error handler — malformed JSON bodies are a client error (400),
// everything else stays a 500.
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.parse.failed' || err instanceof SyntaxError)) {
    return res.status(400).json({ error: 'Malformed JSON in request body' });
  }
  console.error('[Unhandled Server Error]:', err);
  res.status(500).json({ error: 'An unexpected internal server error occurred' });
});

// Start Server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`   MedBridge Backend API running on port ${PORT}`);
    console.log(`   Base URL: http://localhost:${PORT}/api`);
    console.log(`====================================================`);
  });
}

module.exports = app;
