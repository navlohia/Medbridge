const express = require('express');
const router = express.Router();
const { db } = require('../db/database');

// GET /medicines - searchable list
router.get('/', (req, res) => {
  try {
    const q = req.query.q ? req.query.q.trim() : '';
    let medicines;

    if (q) {
      medicines = db.prepare(`
        SELECT id, name, composition, therapeutic_class, side_effects,
               uses_ai_generated, uses_static
        FROM medicines
        WHERE name LIKE ? OR composition LIKE ? OR therapeutic_class LIKE ?
        ORDER BY name ASC
        LIMIT 500
      `).all(`%${q}%`, `%${q}%`, `%${q}%`);
    } else {
      medicines = db.prepare(`
        SELECT id, name, composition, therapeutic_class, side_effects,
               uses_ai_generated, uses_static
        FROM medicines
        ORDER BY name ASC
        LIMIT 1000
      `).all();
    }

    // Include resolved plain_explanation
    const formatted = medicines.map(m => ({
      ...m,
      plain_explanation: m.uses_ai_generated || m.uses_static
    }));

    res.json(formatted);
  } catch (error) {
    console.error('Error fetching medicines:', error);
    res.status(500).json({ error: 'Failed to retrieve medicines' });
  }
});

// GET /medicines/:id - single medicine
router.get('/:id', (req, res) => {
  try {
    const medicine = db.prepare(`
      SELECT id, name, composition, therapeutic_class, side_effects,
             uses_ai_generated, uses_static
      FROM medicines
      WHERE id = ?
    `).get(req.params.id);

    if (!medicine) {
      return res.status(404).json({ error: 'Medicine not found' });
    }

    res.json({
      ...medicine,
      plain_explanation: medicine.uses_ai_generated || medicine.uses_static
    });
  } catch (error) {
    console.error('Error fetching medicine:', error);
    res.status(500).json({ error: 'Failed to retrieve medicine details' });
  }
});

module.exports = router;
