require('dotenv').config();
const express = require('express');
const cors = require('cors');
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

const { LAB_REPORT_UPLOADS_DIR } = require('./config');

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize database schema if not already initialized, then apply incremental migrations
initSchema();
runMigrations();

// Middlewares
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));

// Serve uploaded lab-report images (gitignored folder; auth enforced at the
// route/data level, files referenced by path from lab_report_uploads)
app.use('/uploads', express.static(LAB_REPORT_UPLOADS_DIR));

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
};

mountRouters('/api');
mountRouters('');

// Global error handler
app.use((err, req, res, next) => {
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
