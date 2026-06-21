const express = require('express');
const router  = express.Router();
const pool    = require('../db/db');

// GET /api/geojson/tanah?kecamatan=X
router.get('/tanah', async (req, res) => {
  const { kecamatan, desa, nibar, opd } = req.query;
  const params = [];
  const filters = [];
  if (kecamatan) { params.push(kecamatan);        filters.push(`UPPER(t.kecamatan) = UPPER($${params.length})`); }
  if (desa)      { params.push(`%${desa}%`);      filters.push(`t.desa_kelurahan ILIKE $${params.length}`); }
  if (nibar)     { params.push(`%${nibar}%`);     filters.push(`t.nibar ILIKE $${params.length}`); }
  if (opd)       { params.push(`%${opd}%`);       filters.push(`t.opd ILIKE $${params.length}`); }
  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
  try {
    const result = await pool.query(`
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
          json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(t.geom)::json,
            'properties', json_build_object(
              'id',                  t.id_tanah,
              'nibar',               t.nibar,
              'nama_barang',         t.nama_barang,
              'spesifikasi',         t.spesifikasi,
              'spesifikasi_lainnya', t.spesifikasi_lainnya,
              'opd',                 t.opd,
              'desa_kelurahan',      t.desa_kelurahan,
              'kecamatan',           t.kecamatan,
              'luas_m2',             t.luas_m2,
              'nama_hak',            t.nama_hak,
              'nomor_hak',           t.nomor_hak,
              'nilai_perolehan',     t.nilai_perolehan,
              'cara_perolehan',      t.cara_perolehan
            )
          )
        ), '[]'::json)
      ) AS geojson
      FROM kib_a_tanah t
      WHERE t.geom IS NOT NULL
      ${filters.length ? 'AND ' + filters.join(' AND ') : ''}
    `, params);
    res.json(result.rows[0].geojson);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/geojson/bangunan?kecamatan=X
// Menggunakan nama kolom hasil import SHP dari ArcGIS Pro
router.get('/bangunan', async (req, res) => {
  const { kecamatan, desa, nibar, opd } = req.query;
  const params  = [];
  const filters = [];
  if (kecamatan) { params.push(kecamatan);    filters.push(`UPPER(b."KECAMATAN") = UPPER($${params.length})`); }
  if (desa)      { params.push(`%${desa}%`);  filters.push(`b."DESA_KELUR" ILIKE $${params.length}`); }
  if (nibar)     { params.push(`%${nibar}%`); filters.push(`b."NIBAR" ILIKE $${params.length}`); }
  if (opd)       { params.push(`%${opd}%`);   filters.push(`b."OPD" ILIKE $${params.length}`); }
  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
  try {
    const result = await pool.query(`
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
          json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(b.geometry)::json,
            'properties', json_build_object(
              'nibar',               COALESCE(b."NIBAR", '-'),
              'opd',                 COALESCE(b."OPD", '-'),
              'nama_barang',         COALESCE(b."Nama_Baran", '-'),
              'spesifikasi',         COALESCE(b."Spesifikas", '-'),
              'spesifikasi_lainnya', COALESCE(b."Spesifik_1", '-'),
              'lokasi',              COALESCE(b."Lokasi", '-'),
              'desa_kelurahan',      COALESCE(b."DESA_KELUR", '-'),
              'kecamatan',           COALESCE(b."KECAMATAN", '-'),
              'foto_denah',          COALESCE(b."Foto_denah", ''),
              'lat',                 b."LAT",
              'lng',                 b."LONG"
            )
          )
        ) FILTER (WHERE b.geometry IS NOT NULL), '[]'::json)
      ) AS geojson
      FROM kib_c_bangunan b
      ${where}
    `, params);
    res.json(result.rows[0].geojson);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data bangunan: ' + err.message });
  }
});

// GET /api/geojson/wilayah
router.get('/wilayah', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT json_build_object(
        'type', 'FeatureCollection',
        'features', COALESCE(json_agg(
          json_build_object(
            'type', 'Feature',
            'geometry', ST_AsGeoJSON(geom)::json,
            'properties', json_build_object(
              'id',             id_wilayah,
              'kode_wilayah',   kode_wilayah,
              'nama_kecamatan', nama_kecamatan,
              'nama_kabupaten', nama_kabupaten,
              'tipe_wilayah',   tipe_wilayah
            )
          )
        ), '[]'::json)
      ) AS geojson
      FROM wilayah_administrasi
      WHERE geom IS NOT NULL
    `);
    res.json(result.rows[0].geojson);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal mengambil data wilayah: ' + err.message });
  }
});

module.exports = router;
