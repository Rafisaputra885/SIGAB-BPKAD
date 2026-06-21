const express = require('express');
const router  = express.Router();
const pool    = require('../db/db');

// GET /api/statistik — ringkasan keseluruhan
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM kib_a_tanah)::int                    AS total_tanah,
        (SELECT COUNT(*) FROM kib_c_bangunan
         WHERE geometry IS NOT NULL)::int                          AS total_bangunan,
        (SELECT COALESCE(SUM(luas_m2),0) FROM kib_a_tanah)::float AS total_luas_tanah
    `);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/statistik/kecamatan — rekap per kecamatan
router.get('/kecamatan', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        w.nama_kecamatan,
        COUNT(DISTINCT t.id_tanah)        AS jumlah_tanah,
        COUNT(DISTINCT b.*)               AS jumlah_bangunan,
        COALESCE(SUM(t.luas_m2), 0)      AS total_luas_tanah
      FROM wilayah_administrasi w
      LEFT JOIN kib_a_tanah t ON t.id_wilayah = w.id_wilayah
      LEFT JOIN kib_c_bangunan b
        ON UPPER(b."KECAMATAN") = UPPER(w.nama_kecamatan)
      GROUP BY w.nama_kecamatan
      ORDER BY jumlah_tanah DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/statistik/kondisi — distribusi kondisi aset
router.get('/kondisi', async (req, res) => {
  try {
    const [tanah, bangunan] = await Promise.all([
      pool.query(`
        SELECT kondisi, COUNT(*) AS jumlah
        FROM kib_a_tanah GROUP BY kondisi ORDER BY jumlah DESC
      `),
      // KIB C tidak punya kolom kondisi, gunakan nama_barang sebagai kategori
      pool.query(`
        SELECT "Nama_Baran" AS kategori, COUNT(*) AS jumlah
        FROM kib_c_bangunan
        GROUP BY "Nama_Baran"
        ORDER BY jumlah DESC
        LIMIT 10
      `),
    ]);
    res.json({ tanah: tanah.rows, bangunan: bangunan.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/statistik/bangunan/kecamatan — rekap KIB C per kecamatan
router.get('/bangunan/kecamatan', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        "KECAMATAN"      AS kecamatan,
        COUNT(*)::int    AS jumlah_bangunan
      FROM kib_c_bangunan
      WHERE geometry IS NOT NULL
      GROUP BY "KECAMATAN"
      ORDER BY jumlah_bangunan DESC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
