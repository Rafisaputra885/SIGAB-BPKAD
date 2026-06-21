const express = require('express');
const router  = express.Router();
const pool    = require('../db/db');
const { requireAuth } = require('../middleware/authMiddleware');

router.use(requireAuth);

// GET /api/validasi/tanpa-koordinat — KIB A tanpa geom
router.get('/tanpa-koordinat', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id_tanah AS id, nibar, opd, nama_barang, kecamatan, desa_kelurahan
      FROM kib_a_tanah
      WHERE geom IS NULL
      ORDER BY kecamatan, nibar
      LIMIT 200
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/validasi/bangunan-tanpa-koordinat — KIB C tanpa geometry
router.get('/bangunan-tanpa-koordinat', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT "NIBAR" AS nibar, "OPD" AS opd, "Nama_Baran" AS nama_barang, "KECAMATAN" AS kecamatan
      FROM kib_c_bangunan
      WHERE geometry IS NULL OR "LAT" IS NULL OR "LONG" IS NULL
      ORDER BY "KECAMATAN", "NIBAR"
      LIMIT 200
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
