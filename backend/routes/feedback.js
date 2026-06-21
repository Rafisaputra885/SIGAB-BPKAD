const express = require('express');
const router  = express.Router();
const pool    = require('../db/db');

// POST /api/feedback — terima feedback dari publik (tidak perlu login)
router.post('/', async (req, res) => {
  const { rating, nps, aspek, fitur_berguna, nama, email, masukan, kendala } = req.body;
  if (!masukan) return res.status(400).json({ error: 'Masukan wajib diisi.' });
  try {
    await pool.query(`
      INSERT INTO feedback
        (rating, nps, aspek_peta, aspek_info, aspek_performa, aspek_tampilan,
         fitur_berguna, nama, email, masukan, kendala)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [
      rating||null, nps||null,
      aspek?.peta||null, aspek?.informasi||null, aspek?.performa||null, aspek?.tampilan||null,
      fitur_berguna||[], nama||null, email||null, masukan, kendala||null
    ]);
    res.json({ message: 'Feedback berhasil disimpan.' });
  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ error: 'Gagal menyimpan feedback.' });
  }
});

// GET /api/feedback — lihat semua feedback (admin only, cukup cek token sederhana)
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
