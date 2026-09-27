const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// GET /doctors - List doctors (for Patient's appointment booking picker)
router.get('/', authenticateToken, (req, res) => {
  try {
    const doctors = db.prepare(`
      SELECT id, name, email, specialization
      FROM users
      WHERE role = 'doctor'
      ORDER BY name ASC
    `).all();

    res.json(doctors);
  } catch (error) {
    console.error('Error fetching doctors:', error);
    res.status(500).json({ error: 'Failed to retrieve doctors' });
  }
});

module.exports = router;
