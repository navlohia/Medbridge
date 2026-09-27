const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

// GET /lab-tests
router.get('/', (req, res) => {
  try {
    const tests = db.prepare(`
      SELECT id, test_name, unit, normal_low, normal_high
      FROM lab_tests
      ORDER BY test_name ASC
    `).all();
    res.json(tests);
  } catch (error) {
    console.error('Error fetching lab tests:', error);
    res.status(500).json({ error: 'Failed to retrieve lab tests' });
  }
});

module.exports = router;
