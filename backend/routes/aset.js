const express = require('express');
const router  = express.Router();
const pool    = require('../db/db');

// ─── KIB A (TANAH) ───────────────────────────────────────────────────────────

// GET /api/aset/tanah?search=X&kecamatan=Y&kondisi=Z&page=1&limit=20
router.get('/tanah', async (req, res) => {
  const { search, kecamatan, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const params = [];
  const filters = [];

  if (search) {
    params.push(`%${search}%`);
    filters.push(`(t.nibar ILIKE $${params.length} OR t.opd ILIKE $${params.length} OR t.nama_barang ILIKE $${params.length})`);
  }
  if (kecamatan) {
    params.push(kecamatan);
    filters.push(`UPPER(t.kecamatan) = UPPER($${params.length})`);
  }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  try {
    const [data, total] = await Promise.all([
      pool.query(`
        SELECT *,
          ST_Y(ST_Centroid(geom)) AS latitude,
          ST_X(ST_Centroid(geom)) AS longitude
        FROM kib_a_tanah t
        ${where}
        ORDER BY t.id_tanah
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, limit, offset]),
      pool.query(`
        SELECT COUNT(*) FROM kib_a_tanah t ${where}
      `, params),
    ]);

    res.json({ data: data.rows, total: parseInt(total.rows[0].count), page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/aset/tanah/:id
router.get('/tanah/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*,
             ST_Y(ST_Centroid(t.geom)) AS latitude,
             ST_X(ST_Centroid(t.geom)) AS longitude,
             ST_AsGeoJSON(t.geom)::json AS geometry
      FROM kib_a_tanah t
      WHERE t.id_tanah = $1
    `, [req.params.id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/aset/tanah — tambah aset tanah (admin)
router.post('/tanah', async (req, res) => {
  const {
    nibar, nomor_register, opd, nama_barang, spesifikasi, spesifikasi_lainnya,
    alamat, desa_kelurahan, kecamatan, luas_m2, satuan, nama_hak, nomor_hak,
    tanggal_hak, nama_kepemilikan_dokumen, nilai_perolehan, cara_perolehan,
    tanggal_perolehan, status_penggunaan, keterangan, geojson
  } = req.body;

  try {
    const result = await pool.query(`
      INSERT INTO kib_a_tanah
        (nibar, nomor_register, opd, nama_barang, spesifikasi, spesifikasi_lainnya,
         alamat, desa_kelurahan, kecamatan, luas_m2, satuan, nama_hak, nomor_hak,
         tanggal_hak, nama_kepemilikan_dokumen, nilai_perolehan, cara_perolehan,
         tanggal_perolehan, status_penggunaan, keterangan, geom, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
              CASE WHEN $21::text IS NOT NULL THEN ST_SetSRID(ST_GeomFromGeoJSON($21), 4326) ELSE NULL END,
              NOW())
      RETURNING id_tanah
    `, [nibar, nomor_register, opd, nama_barang, spesifikasi, spesifikasi_lainnya,
        alamat, desa_kelurahan, kecamatan, luas_m2||null, satuan, nama_hak, nomor_hak,
        tanggal_hak||null, nama_kepemilikan_dokumen, nilai_perolehan||null, cara_perolehan,
        tanggal_perolehan||null, status_penggunaan, keterangan,
        geojson ? JSON.stringify(geojson) : null]);

    res.status(201).json({ id_tanah: result.rows[0].id_tanah });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/aset/tanah/:id — edit aset tanah (admin)
router.put('/tanah/:id', async (req, res) => {
  const {
    nama_aset, id_wilayah, luas_m2, status_kepemilikan,
    nomor_sertifikat, tahun_perolehan, kondisi, keterangan, geojson
  } = req.body;

  try {
    const {
      nibar, nomor_register, opd, nama_barang, spesifikasi, spesifikasi_lainnya,
      alamat, desa_kelurahan, kecamatan, luas_m2, satuan, nama_hak, nomor_hak,
      tanggal_hak, nama_kepemilikan_dokumen, nilai_perolehan, cara_perolehan,
      tanggal_perolehan, status_penggunaan, keterangan, latitude, longitude, geojson
    } = req.body;

    const geomExpr = geojson
      ? `geom = ST_SetSRID(ST_GeomFromGeoJSON($22), 4326),`
      : '';
    const params = [
      nibar, nomor_register, opd, nama_barang, spesifikasi, spesifikasi_lainnya,
      alamat, desa_kelurahan, kecamatan, luas_m2||null, satuan, nama_hak, nomor_hak,
      tanggal_hak||null, nama_kepemilikan_dokumen, nilai_perolehan||null, cara_perolehan,
      tanggal_perolehan||null, status_penggunaan, keterangan,
      req.params.id,
    ];
    if (geojson) params.push(JSON.stringify(geojson));

    await pool.query(`
      UPDATE kib_a_tanah SET
        nibar=$1, nomor_register=$2, opd=$3, nama_barang=$4,
        spesifikasi=$5, spesifikasi_lainnya=$6, alamat=$7,
        desa_kelurahan=$8, kecamatan=$9, luas_m2=$10, satuan=$11,
        nama_hak=$12, nomor_hak=$13, tanggal_hak=$14,
        nama_kepemilikan_dokumen=$15, nilai_perolehan=$16,
        cara_perolehan=$17, tanggal_perolehan=$18,
        status_penggunaan=$19, keterangan=$20,
        ${geomExpr}
        updated_at=NOW()
      WHERE id_tanah=$21
    `, params);

    res.json({ message: 'Data berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/aset/tanah/:id — hapus aset tanah (admin)
router.delete('/tanah/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM kib_a_tanah WHERE id_tanah = $1', [req.params.id]);
    res.json({ message: 'Data berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── KIB C (BANGUNAN) ────────────────────────────────────────────────────────

// GET /api/aset/bangunan?search=X&kecamatan=Y&kondisi=Z
router.get('/bangunan', async (req, res) => {
  const { search, kecamatan, kondisi, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const params = [];
  const filters = [];

  if (search) {
    params.push(`%${search}%`);
    filters.push(`(b.nama_bangunan ILIKE $${params.length} OR b.kode_aset ILIKE $${params.length})`);
  }
  if (kecamatan) {
    params.push(kecamatan);
    filters.push(`w.nama_kecamatan = $${params.length}`);
  }
  if (kondisi) {
    params.push(kondisi);
    filters.push(`b.kondisi = $${params.length}`);
  }

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  try {
    const [data, total] = await Promise.all([
      pool.query(`
        SELECT b.*, w.nama_kecamatan, w.nama_desa
        FROM kib_c_bangunan b
        LEFT JOIN wilayah_administrasi w ON b.id_wilayah = w.id_wilayah
        ${where}
        ORDER BY b.id_bangunan
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, limit, offset]),
      pool.query(`
        SELECT COUNT(*) FROM kib_c_bangunan b
        LEFT JOIN wilayah_administrasi w ON b.id_wilayah = w.id_wilayah
        ${where}
      `, params),
    ]);

    res.json({ data: data.rows, total: parseInt(total.rows[0].count), page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/aset/bangunan/:id
router.get('/bangunan/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.*, w.nama_kecamatan, w.nama_desa,
             t.nama_aset AS nama_tanah,
             ST_AsGeoJSON(b.geom)::json AS geometry
      FROM kib_c_bangunan b
      LEFT JOIN wilayah_administrasi w ON b.id_wilayah = w.id_wilayah
      LEFT JOIN kib_a_tanah t ON b.id_tanah = t.id_tanah
      WHERE b.id_bangunan = $1
    `, [req.params.id]);

    if (!result.rows.length) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/aset/bangunan — tambah (admin)
router.post('/bangunan', async (req, res) => {
  const {
    kode_aset, nama_bangunan, id_tanah, id_wilayah,
    luas_lantai_m2, jumlah_lantai, tahun_dibangun,
    tahun_perolehan, kondisi, keterangan, geojson
  } = req.body;

  try {
    const result = await pool.query(`
      INSERT INTO kib_c_bangunan
        (kode_aset, nama_bangunan, id_tanah, id_wilayah, luas_lantai_m2,
         jumlah_lantai, tahun_dibangun, tahun_perolehan, kondisi, keterangan, geom)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
              ST_SetSRID(ST_GeomFromGeoJSON($11), 4326))
      RETURNING id_bangunan
    `, [kode_aset, nama_bangunan, id_tanah, id_wilayah, luas_lantai_m2,
        jumlah_lantai, tahun_dibangun, tahun_perolehan, kondisi, keterangan,
        JSON.stringify(geojson)]);

    res.status(201).json({ id_bangunan: result.rows[0].id_bangunan });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/aset/bangunan/:id — edit (admin)
router.put('/bangunan/:id', async (req, res) => {
  const {
    nama_bangunan, id_tanah, id_wilayah, luas_lantai_m2,
    jumlah_lantai, tahun_dibangun, tahun_perolehan,
    kondisi, keterangan, geojson
  } = req.body;

  try {
    await pool.query(`
      UPDATE kib_c_bangunan SET
        nama_bangunan=$1, id_tanah=$2, id_wilayah=$3, luas_lantai_m2=$4,
        jumlah_lantai=$5, tahun_dibangun=$6, tahun_perolehan=$7,
        kondisi=$8, keterangan=$9,
        geom=ST_SetSRID(ST_GeomFromGeoJSON($10), 4326),
        updated_at=NOW()
      WHERE id_bangunan=$11
    `, [nama_bangunan, id_tanah, id_wilayah, luas_lantai_m2,
        jumlah_lantai, tahun_dibangun, tahun_perolehan, kondisi, keterangan,
        JSON.stringify(geojson), req.params.id]);

    res.json({ message: 'Data berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/aset/bangunan/:id — hapus (admin)
router.delete('/bangunan/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM kib_c_bangunan WHERE id_bangunan = $1', [req.params.id]);
    res.json({ message: 'Data berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ─── KIB C BANGUNAN (kolom hasil import SHP) ─────────────────────────────────

// GET /api/aset/bangunan-kib
router.get('/bangunan-kib', async (req, res) => {
  const { search, kecamatan, foto, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const params = [];
  const filters = [];

  if (search) {
    params.push(`%${search}%`);
    filters.push(`("NIBAR" ILIKE $${params.length} OR "OPD" ILIKE $${params.length} OR "Nama_Baran" ILIKE $${params.length})`);
  }
  if (kecamatan) {
    params.push(kecamatan);
    filters.push(`UPPER("KECAMATAN") = UPPER($${params.length})`);
  }
  if (foto === 'ada')   filters.push(`"Foto_denah" IS NOT NULL AND "Foto_denah" <> ''`);
  if (foto === 'tidak') filters.push(`("Foto_denah" IS NULL OR "Foto_denah" = '')`);

  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  try {
    const [data, total] = await Promise.all([
      pool.query(`
        SELECT
          "NIBAR","OPD","Nama_Baran","Spesifikas","Spesifik_1",
          "Lokasi","DESA_KELUR","KECAMATAN","LAT","LONG","Foto_denah",
          ctid::text AS row_id
        FROM kib_c_bangunan
        ${where}
        ORDER BY "NIBAR"
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, limit, offset]),
      pool.query(`SELECT COUNT(*) FROM kib_c_bangunan ${where}`, params),
    ]);
    res.json({ data: data.rows, total: parseInt(total.rows[0].count), page, limit });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/aset/bangunan-kib
router.post('/bangunan-kib', async (req, res) => {
  const { NIBAR, OPD, Nama_Baran, Spesifikas, Spesifik_1, Lokasi, DESA_KELUR, KECAMATAN, Foto_denah, LAT, LONG } = req.body;
  try {
    const lat = LAT ? parseFloat(LAT) : null;
    const lng = LONG ? parseFloat(LONG) : null;
    const geomSQL = (lat && lng)
      ? `ST_SetSRID(ST_MakePoint($11, $10), 4326)`
      : 'NULL';
    const params = [NIBAR,OPD,Nama_Baran||null,Spesifikas||null,Spesifik_1||null,
                    Lokasi||null,DESA_KELUR||null,KECAMATAN||null,Foto_denah||null,lat,lng];
    await pool.query(`
      INSERT INTO kib_c_bangunan
        ("NIBAR","OPD","Nama_Baran","Spesifikas","Spesifik_1","Lokasi","DESA_KELUR","KECAMATAN","Foto_denah","LAT","LONG",geometry)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,${geomSQL})
    `, params);
    res.status(201).json({ message: 'Aset berhasil ditambahkan', nibar: NIBAR });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/aset/bangunan-kib/:nibar  (pakai NIBAR sebagai identifier)
router.put('/bangunan-kib/:id', async (req, res) => {
  const { OPD, Nama_Baran, Spesifikas, Spesifik_1, Lokasi, DESA_KELUR, KECAMATAN, Foto_denah, LAT, LONG } = req.body;
  const nibarParam = decodeURIComponent(req.params.id);
  try {
    const lat = LAT ? parseFloat(LAT) : null;
    const lng = LONG ? parseFloat(LONG) : null;
    const geomSQL = (lat && lng)
      ? `, geometry = ST_SetSRID(ST_MakePoint($11, $10), 4326), "LAT"=$10, "LONG"=$11`
      : '';
    const params = [OPD,Nama_Baran||null,Spesifikas||null,Spesifik_1||null,
                    Lokasi||null,DESA_KELUR||null,KECAMATAN||null,Foto_denah||null,nibarParam,lat,lng];
    await pool.query(`
      UPDATE kib_c_bangunan SET
        "OPD"=$1,"Nama_Baran"=$2,"Spesifikas"=$3,"Spesifik_1"=$4,
        "Lokasi"=$5,"DESA_KELUR"=$6,"KECAMATAN"=$7,"Foto_denah"=$8
        ${geomSQL}
      WHERE "NIBAR"=$9
    `, params);
    res.json({ message: 'Data berhasil diperbarui' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/aset/bangunan-kib/:nibar
router.delete('/bangunan-kib/:id', async (req, res) => {
  try {
    const nibarParam = decodeURIComponent(req.params.id);
    await pool.query('DELETE FROM kib_c_bangunan WHERE "NIBAR" = $1', [nibarParam]);
    res.json({ message: 'Data berhasil dihapus' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
