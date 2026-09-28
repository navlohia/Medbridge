const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// GET /diagnoses - searchable list (P19: valid token required)
router.get('/', authenticateToken, (req, res) => {
  try {
    const q = req.query.q ? req.query.q.trim() : '';
    let diagnoses;

    if (q) {
      diagnoses = db.prepare(`
        SELECT id, name, description, symptoms, precautions
        FROM diagnoses
        WHERE name LIKE ? OR symptoms LIKE ?
        ORDER BY name ASC
      `).all(`%${q}%`, `%${q}%`);
    } else {
      diagnoses = db.prepare(`
        SELECT id, name, description, symptoms, precautions
        FROM diagnoses
        ORDER BY name ASC
      `).all();
    }

    res.json(diagnoses);
  } catch (error) {
    console.error('Error fetching diagnoses:', error);
    res.status(500).json({ error: 'Failed to retrieve diagnoses' });
  }
});

module.exports = router;
