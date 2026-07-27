const express = require('express');
const router  = express.Router();
const pool    = require('../db/db');

// ── HELPER: Simpan history ────────────────────────────────────────────────────
async function simpanHistory(tabel, asetId, aksi, dataLama, dataBaru, geomLama, geomBaru, username) {
  try {
    let fieldBerubah = [];
    let jenisPerubahan = 'ATRIBUT';

    if (dataLama && dataBaru) {
      const skip = ['geom','geometry','created_at','updated_at','latitude','longitude','geom_json','row_id'];
      Object.keys(dataBaru).forEach(key => {
        if (skip.includes(key)) return;
        const lama = String(dataLama[key] ?? '');
        const baru = String(dataBaru[key] ?? '');
        if (lama !== baru) fieldBerubah.push(key);
      });
    }

    const geomBerubah = (geomLama || geomBaru) &&
      JSON.stringify(geomLama) !== JSON.stringify(geomBaru);

    if      (aksi === 'CREATE') jenisPerubahan = 'CREATE';
    else if (aksi === 'DELETE') jenisPerubahan = 'DELETE';
    else if (geomBerubah && fieldBerubah.length > 0) jenisPerubahan = 'KEDUANYA';
    else if (geomBerubah)  jenisPerubahan = 'GEOMETRI';
    else                   jenisPerubahan = 'ATRIBUT';

    // Build params dinamis untuk geom
    const baseParams = [
      tabel, String(asetId), aksi, jenisPerubahan,
      fieldBerubah.length ? fieldBerubah : null,
      dataLama ? JSON.stringify(dataLama) : null,
      dataBaru ? JSON.stringify(dataBaru) : null,
      username || 'sistem',
    ];

    let geomLamaExpr = 'NULL';
    let geomBaruExpr = 'NULL';
    const extraParams = [];

    if (geomLama) {
      extraParams.push(JSON.stringify(geomLama));
      geomLamaExpr = `ST_SetSRID(ST_GeomFromGeoJSON($${baseParams.length + extraParams.length}), 4326)`;
    }
    if (geomBaru) {
      extraParams.push(JSON.stringify(geomBaru));
      geomBaruExpr = `ST_SetSRID(ST_GeomFromGeoJSON($${baseParams.length + extraParams.length}), 4326)`;
    }

    await pool.query(`
      INSERT INTO aset_history
        (tabel, aset_id, aksi, jenis_perubahan, field_berubah,
         data_lama, data_baru, geom_lama, geom_baru, diubah_oleh)
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,${geomLamaExpr},${geomBaruExpr},$8)
    `, [...baseParams, ...extraParams]);
  } catch(err) {
    console.error('Gagal simpan history:', err.message);
  }
}

// ── GET history tanah ─────────────────────────────────────────────────────────
router.get('/history/tanah/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, aksi, jenis_perubahan, field_berubah,
             data_lama, data_baru,
             ST_AsGeoJSON(geom_lama)::json AS geom_lama,
             ST_AsGeoJSON(geom_baru)::json  AS geom_baru,
             diubah_oleh, diubah_pada
      FROM aset_history
      WHERE tabel = 'kib_a' AND aset_id = $1
      ORDER BY diubah_pada DESC LIMIT 50
    `, [req.params.id]);
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── GET history bangunan ──────────────────────────────────────────────────────
router.get('/history/bangunan/:nibar', async (req, res) => {
  try {
    const nibar = decodeURIComponent(req.params.nibar);
    const result = await pool.query(`
      SELECT id, aksi, jenis_perubahan, field_berubah,
             data_lama, data_baru,
             ST_AsGeoJSON(geom_lama)::json AS geom_lama,
             ST_AsGeoJSON(geom_baru)::json  AS geom_baru,
             diubah_oleh, diubah_pada
      FROM aset_history
      WHERE tabel = 'kib_c' AND aset_id = $1
      ORDER BY diubah_pada DESC LIMIT 50
    `, [nibar]);
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── GET aset yang dihapus (untuk modal pulihkan) ─────────────────────────────
router.get('/history/deleted/:tabel', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, aset_id, data_lama, diubah_oleh, diubah_pada
      FROM aset_history
      WHERE tabel = $1 AND aksi = 'DELETE'
        AND diubah_oleh NOT LIKE '%(restore)%'
      ORDER BY diubah_pada DESC
      LIMIT 100
    `, [req.params.tabel]);
    res.json(result.rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE history item ───────────────────────────────────────────────────────
router.delete('/history/:historyId', async (req, res) => {
  try {
    await pool.query('DELETE FROM aset_history WHERE id = $1', [req.params.historyId]);
    res.json({ message: 'Riwayat berhasil dihapus' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── DELETE semua history aset ─────────────────────────────────────────────────
router.delete('/history/clear/:tabel/:asetId', async (req, res) => {
  try {
    const nibar = decodeURIComponent(req.params.asetId);
    await pool.query(
      'DELETE FROM aset_history WHERE tabel = $1 AND aset_id = $2',
      [req.params.tabel, nibar]
    );
    res.json({ message: 'Semua riwayat berhasil dihapus' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── ROLLBACK ──────────────────────────────────────────────────────────────────
router.post('/history/rollback/:historyId', async (req, res) => {
  const { username } = req.body;
  try {
    const hist = await pool.query('SELECT * FROM aset_history WHERE id = $1', [req.params.historyId]);
    if (!hist.rows.length) return res.status(404).json({ error: 'History tidak ditemukan' });

    const h       = hist.rows[0];
    const dataLama = h.data_lama;
    if (!dataLama) return res.status(400).json({ error: 'Tidak ada data lama untuk di-rollback' });

    if (h.tabel === 'kib_a') {
      const cur = await pool.query(
        `SELECT *, ST_AsGeoJSON(geom)::json AS geom_json FROM kib_a_tanah WHERE id_tanah = $1`,
        [h.aset_id]
      );
      const curData = cur.rows[0] || {};

      // Catatan: kolom "nama_kepemilikan_dokumen" TIDAK ADA di tabel kib_a_tanah
      // (data sumber dari BPKAD memang tidak menyertakan info ini), sehingga
      // sengaja tidak disertakan di query berikut.
      await pool.query(`
        UPDATE kib_a_tanah SET
          nibar=$1, nomor_register=$2, opd=$3, nama_barang=$4,
          spesifikasi=$5, spesifikasi_lainnya=$6, alamat=$7,
          desa_kelurahan=$8, kecamatan=$9, luas_m2=$10, satuan=$11,
          nama_hak=$12, nomor_hak=$13, tanggal_hak=$14,
          nilai_perolehan=$15,
          cara_perolehan=$16, tanggal_perolehan=$17,
          status_penggunaan=$18, keterangan=$19, updated_at=NOW()
        WHERE id_tanah=$20
      `, [
        dataLama.nibar, dataLama.nomor_register, dataLama.opd, dataLama.nama_barang,
        dataLama.spesifikasi, dataLama.spesifikasi_lainnya, dataLama.alamat,
        dataLama.desa_kelurahan, dataLama.kecamatan, dataLama.luas_m2,
        dataLama.satuan, dataLama.nama_hak, dataLama.nomor_hak, dataLama.tanggal_hak,
        dataLama.nilai_perolehan, dataLama.cara_perolehan,
        dataLama.tanggal_perolehan, dataLama.status_penggunaan, dataLama.keterangan,
        h.aset_id
      ]);

      if (h.geom_lama) {
        await pool.query(
          `UPDATE kib_a_tanah SET geom = ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) WHERE id_tanah = $2`,
          [JSON.stringify(h.geom_lama), h.aset_id]
        );
      }

      await simpanHistory('kib_a', h.aset_id, 'UPDATE', curData, dataLama,
        curData.geom_json, h.geom_lama, `${username || 'admin'} (rollback)`);

    } else if (h.tabel === 'kib_c') {
      const cur = await pool.query(
        `SELECT *, ST_AsGeoJSON(geometry)::json AS geom_json FROM kib_c_bangunan WHERE "NIBAR" = $1`,
        [h.aset_id]
      );
      const curData = cur.rows[0] || {};

      const lat = dataLama.LAT ? parseFloat(dataLama.LAT) : null;
      const lng = dataLama.LONG ? parseFloat(dataLama.LONG) : null;

      const params = [
        dataLama.OPD||null, dataLama.Nama_Baran||null, dataLama.Spesifikas||null,
        dataLama.Spesifik_1||null, dataLama.Lokasi||null, dataLama.DESA_KELUR||null,
        dataLama.KECAMATAN||null, dataLama.Foto_denah||null, h.aset_id,
      ];
      let geomSQL = '';
      if (lat && lng) {
        params.push(lat); params.push(lng);
        geomSQL = `, geometry=ST_SetSRID(ST_MakePoint($11::float8,$10::float8),4326), "LAT"=$10::float8, "LONG"=$11::float8`;
      }

      await pool.query(`
        UPDATE kib_c_bangunan SET
          "OPD"=$1,"Nama_Baran"=$2,"Spesifikas"=$3,"Spesifik_1"=$4,
          "Lokasi"=$5,"DESA_KELUR"=$6,"KECAMATAN"=$7,"Foto_denah"=$8
          ${geomSQL}
        WHERE "NIBAR"=$9
      `, params);

      const geomBaru = (lat && lng) ? { type:'Point', coordinates:[lng,lat] } : curData.geom_json;
      await simpanHistory('kib_c', h.aset_id, 'UPDATE', curData, dataLama,
        curData.geom_json, geomBaru, `${username || 'admin'} (rollback)`);
    }

    res.json({ message: 'Rollback berhasil' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── RESTORE (pulihkan aset yang dihapus) ─────────────────────────────────────
router.post('/history/restore/:historyId', async (req, res) => {
  const { username } = req.body;
  try {
    const hist = await pool.query('SELECT * FROM aset_history WHERE id = $1', [req.params.historyId]);
    if (!hist.rows.length) return res.status(404).json({ error: 'History tidak ditemukan' });

    const h       = hist.rows[0];
    const dataLama = h.data_lama;
    if (!dataLama) return res.status(400).json({ error: 'Tidak ada data untuk dipulihkan' });
    if (h.aksi !== 'DELETE') return res.status(400).json({ error: 'Hanya bisa restore dari aksi DELETE' });

    if (h.tabel === 'kib_a') {
      // Cek apakah aset masih ada (mungkin sudah di-restore sebelumnya)
      const existing = await pool.query(
        'SELECT id_tanah FROM kib_a_tanah WHERE id_tanah = $1', [h.aset_id]
      );
      if (existing.rows.length) {
        return res.status(400).json({ error: 'Aset sudah ada di database (sudah pernah dipulihkan)' });
      }

      // Catatan: kolom "nama_kepemilikan_dokumen" TIDAK ADA di tabel kib_a_tanah,
      // sengaja tidak disertakan di query berikut.
      const result = await pool.query(`
        INSERT INTO kib_a_tanah
          (id_tanah, nibar, nomor_register, opd, nama_barang, spesifikasi, spesifikasi_lainnya,
           alamat, desa_kelurahan, kecamatan, luas_m2, satuan, nama_hak, nomor_hak,
           tanggal_hak, nilai_perolehan, cara_perolehan,
           tanggal_perolehan, status_penggunaan, keterangan, geom, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
          CASE WHEN $21::text IS NOT NULL THEN ST_SetSRID(ST_GeomFromGeoJSON($21),4326) ELSE NULL END,
          NOW())
        RETURNING id_tanah
      `, [
        h.aset_id,
        dataLama.nibar, dataLama.nomor_register, dataLama.opd, dataLama.nama_barang,
        dataLama.spesifikasi, dataLama.spesifikasi_lainnya, dataLama.alamat,
        dataLama.desa_kelurahan, dataLama.kecamatan, dataLama.luas_m2,
        dataLama.satuan, dataLama.nama_hak, dataLama.nomor_hak, dataLama.tanggal_hak,
        dataLama.nilai_perolehan, dataLama.cara_perolehan,
        dataLama.tanggal_perolehan, dataLama.status_penggunaan, dataLama.keterangan,
        h.geom_lama ? JSON.stringify(h.geom_lama) : null
      ]);

      await simpanHistory('kib_a', h.aset_id, 'CREATE', null, dataLama,
        null, h.geom_lama, `${username || 'admin'} (restore)`);

    } else if (h.tabel === 'kib_c') {
      const existing = await pool.query(
        'SELECT "NIBAR" FROM kib_c_bangunan WHERE "NIBAR" = $1', [h.aset_id]
      );
      if (existing.rows.length) {
        return res.status(400).json({ error: 'Aset sudah ada di database (sudah pernah dipulihkan)' });
      }

      const lat = dataLama.LAT ? parseFloat(dataLama.LAT) : null;
      const lng = dataLama.LONG ? parseFloat(dataLama.LONG) : null;
      const geomSQL = (lat && lng)
        ? `ST_SetSRID(ST_MakePoint($11::float8,$10::float8),4326)` : 'NULL';
      const params = [
        dataLama.NIBAR||h.aset_id, dataLama.OPD||null, dataLama.Nama_Baran||null,
        dataLama.Spesifikas||null, dataLama.Spesifik_1||null, dataLama.Lokasi||null,
        dataLama.DESA_KELUR||null, dataLama.KECAMATAN||null, dataLama.Foto_denah||null,
        lat, lng
      ];

      await pool.query(`
        INSERT INTO kib_c_bangunan
          ("NIBAR","OPD","Nama_Baran","Spesifikas","Spesifik_1","Lokasi",
           "DESA_KELUR","KECAMATAN","Foto_denah","LAT","LONG",geometry)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,${geomSQL})
      `, params);

      await simpanHistory('kib_c', h.aset_id, 'CREATE', null, dataLama,
        null, null, `${username || 'admin'} (restore)`);
    }

    res.json({ message: 'Aset berhasil dipulihkan' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── KIB A TANAH ─────────────────────────────────────────────────────────────

router.get('/tanah', async (req, res) => {
  const { search, kecamatan, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const params = [], filters = [];
  if (search) { params.push(`%${search}%`); filters.push(`(t.nibar ILIKE $${params.length} OR t.opd ILIKE $${params.length} OR t.nama_barang ILIKE $${params.length})`); }
  if (kecamatan) { params.push(kecamatan); filters.push(`UPPER(t.kecamatan) = UPPER($${params.length})`); }
  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
  try {
    const [data, total] = await Promise.all([
      pool.query(`SELECT *, ST_Y(ST_Centroid(geom)) AS latitude, ST_X(ST_Centroid(geom)) AS longitude FROM kib_a_tanah t ${where} ORDER BY t.id_tanah LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]),
      pool.query(`SELECT COUNT(*) FROM kib_a_tanah t ${where}`, params),
    ]);
    res.json({ data: data.rows, total: parseInt(total.rows[0].count), page, limit });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.get('/tanah/:id', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, ST_Y(ST_Centroid(t.geom)) AS latitude, ST_X(ST_Centroid(t.geom)) AS longitude, ST_AsGeoJSON(t.geom)::json AS geometry
      FROM kib_a_tanah t WHERE t.id_tanah = $1
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Aset tidak ditemukan' });
    res.json(result.rows[0]);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/tanah', async (req, res) => {
  // Catatan: kolom "nama_kepemilikan_dokumen" TIDAK ADA di tabel kib_a_tanah
  // (data sumber dari BPKAD memang tidak menyertakan info ini), sehingga
  // sengaja tidak diambil dari req.body maupun disertakan di query berikut.
  const {
    nibar, nomor_register, opd, nama_barang, spesifikasi, spesifikasi_lainnya,
    alamat, desa_kelurahan, kecamatan, luas_m2, satuan, nama_hak, nomor_hak,
    tanggal_hak, nilai_perolehan, cara_perolehan,
    tanggal_perolehan, status_penggunaan, keterangan, geojson, username
  } = req.body;
  try {
    const result = await pool.query(`
      INSERT INTO kib_a_tanah
        (nibar,nomor_register,opd,nama_barang,spesifikasi,spesifikasi_lainnya,
         alamat,desa_kelurahan,kecamatan,luas_m2,satuan,nama_hak,nomor_hak,
         tanggal_hak,nilai_perolehan,cara_perolehan,
         tanggal_perolehan,status_penggunaan,keterangan,geom,created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
        CASE WHEN $20::text IS NOT NULL THEN ST_SetSRID(ST_GeomFromGeoJSON($20),4326) ELSE NULL END, NOW())
      RETURNING id_tanah
    `, [nibar,nomor_register,opd,nama_barang,spesifikasi,spesifikasi_lainnya,
        alamat,desa_kelurahan,kecamatan,luas_m2||null,satuan,nama_hak,nomor_hak,
        tanggal_hak||null,nilai_perolehan||null,cara_perolehan,
        tanggal_perolehan||null,status_penggunaan,keterangan,
        geojson ? JSON.stringify(geojson) : null]);
    const newId = result.rows[0].id_tanah;
    await simpanHistory('kib_a', newId, 'CREATE', null, req.body, null, geojson||null, username||'admin');
    res.status(201).json({ id_tanah: newId });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── FIX: PUT tanah - pisah params geojson ─────────────────────────────────────
router.put('/tanah/:id', async (req, res) => {
  // Catatan: kolom "nama_kepemilikan_dokumen" TIDAK ADA di tabel kib_a_tanah
  // (data sumber dari BPKAD memang tidak menyertakan info ini). Sebelumnya
  // field ini masih diambil dari req.body dan disertakan di query UPDATE,
  // sehingga SETIAP update aset tanah gagal dengan error
  // 'column "nama_kepemilikan_dokumen" of relation "kib_a_tanah" does not exist'.
  // Sekarang field ini dihapus total dari destructuring dan query.
  const {
    nibar, nomor_register, opd, nama_barang, spesifikasi, spesifikasi_lainnya,
    alamat, desa_kelurahan, kecamatan, luas_m2, satuan, nama_hak, nomor_hak,
    tanggal_hak, nilai_perolehan, cara_perolehan,
    tanggal_perolehan, status_penggunaan, keterangan, geojson, username
  } = req.body;

  try {
    const lama = await pool.query(
      `SELECT *, ST_AsGeoJSON(geom)::json AS geom_json FROM kib_a_tanah WHERE id_tanah = $1`,
      [req.params.id]
    );
    const dataLama = lama.rows[0] || {};
    const geomLama = dataLama.geom_json || null;

    // ── Params atribut: $1-$19, WHERE id=$20, geojson=$21 (opsional) ──
    const params = [
      nibar, nomor_register, opd, nama_barang, spesifikasi, spesifikasi_lainnya,
      alamat, desa_kelurahan, kecamatan, luas_m2||null, satuan, nama_hak, nomor_hak,
      tanggal_hak||null, nilai_perolehan||null, cara_perolehan,
      tanggal_perolehan||null, status_penggunaan, keterangan,
      req.params.id,  // $20 = WHERE id_tanah
    ];

    let geomExpr = '';
    if (geojson) {
      params.push(JSON.stringify(geojson)); // $21
      geomExpr = `geom = ST_SetSRID(ST_GeomFromGeoJSON($21), 4326),`;
    }

    await pool.query(`
      UPDATE kib_a_tanah SET
        nibar=$1, nomor_register=$2, opd=$3, nama_barang=$4,
        spesifikasi=$5, spesifikasi_lainnya=$6, alamat=$7,
        desa_kelurahan=$8, kecamatan=$9, luas_m2=$10, satuan=$11,
        nama_hak=$12, nomor_hak=$13, tanggal_hak=$14,
        nilai_perolehan=$15,
        cara_perolehan=$16, tanggal_perolehan=$17,
        status_penggunaan=$18, keterangan=$19,
        ${geomExpr}
        updated_at=NOW()
      WHERE id_tanah=$20
    `, params);

    await simpanHistory('kib_a', req.params.id, 'UPDATE',
      dataLama, req.body, geomLama, geojson||geomLama, username||'admin');

    res.json({ message: 'Data berhasil diperbarui' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.delete('/tanah/:id', async (req, res) => {
  const { username } = req.body || {};
  try {
    const lama = await pool.query(
      `SELECT *, ST_AsGeoJSON(geom)::json AS geom_json FROM kib_a_tanah WHERE id_tanah = $1`,
      [req.params.id]
    );
    const dataLama = lama.rows[0] || {};
    await pool.query('DELETE FROM kib_a_tanah WHERE id_tanah = $1', [req.params.id]);
    await simpanHistory('kib_a', req.params.id, 'DELETE',
      dataLama, null, dataLama.geom_json||null, null, username||'admin');
    res.json({ message: 'Data berhasil dihapus' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ─── KIB C BANGUNAN ──────────────────────────────────────────────────────────

router.get('/bangunan-kib', async (req, res) => {
  const { search, kecamatan, foto, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  const params = [], filters = [];
  if (search) { params.push(`%${search}%`); filters.push(`("NIBAR" ILIKE $${params.length} OR "OPD" ILIKE $${params.length} OR "Nama_Baran" ILIKE $${params.length})`); }
  if (kecamatan) { params.push(kecamatan); filters.push(`UPPER("KECAMATAN") = UPPER($${params.length})`); }
  if (foto === 'ada')   filters.push(`"Foto_denah" IS NOT NULL AND "Foto_denah" <> ''`);
  if (foto === 'tidak') filters.push(`("Foto_denah" IS NULL OR "Foto_denah" = '')`);
  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';
  try {
    const [data, total] = await Promise.all([
      pool.query(`SELECT "NIBAR","OPD","Nama_Baran","Spesifikas","Spesifik_1","Lokasi","DESA_KELUR","KECAMATAN","LAT","LONG","Foto_denah",ctid::text AS row_id FROM kib_c_bangunan ${where} ORDER BY "NIBAR" LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, limit, offset]),
      pool.query(`SELECT COUNT(*) FROM kib_c_bangunan ${where}`, params),
    ]);
    res.json({ data: data.rows, total: parseInt(total.rows[0].count), page, limit });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.post('/bangunan-kib', async (req, res) => {
  const { NIBAR, OPD, Nama_Baran, Spesifikas, Spesifik_1, Lokasi, DESA_KELUR, KECAMATAN, Foto_denah, LAT, LONG, username } = req.body;
  try {
    const lat = LAT ? parseFloat(LAT) : null;
    const lng = LONG ? parseFloat(LONG) : null;
    const geomSQL = (lat && lng) ? `ST_SetSRID(ST_MakePoint($11::float8,$10::float8),4326)` : 'NULL';
    await pool.query(`
      INSERT INTO kib_c_bangunan ("NIBAR","OPD","Nama_Baran","Spesifikas","Spesifik_1","Lokasi","DESA_KELUR","KECAMATAN","Foto_denah","LAT","LONG",geometry)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,${geomSQL})
    `, [NIBAR,OPD,Nama_Baran||null,Spesifikas||null,Spesifik_1||null,Lokasi||null,DESA_KELUR||null,KECAMATAN||null,Foto_denah||null,lat,lng]);
    await simpanHistory('kib_c', NIBAR, 'CREATE', null, req.body, null, null, username||'admin');
    res.status(201).json({ message: 'Aset berhasil ditambahkan', nibar: NIBAR });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.put('/bangunan-kib/:id', async (req, res) => {
  const { OPD, Nama_Baran, Spesifikas, Spesifik_1, Lokasi, DESA_KELUR, KECAMATAN, Foto_denah, LAT, LONG, username } = req.body;
  const nibarParam = decodeURIComponent(req.params.id);
  try {
    const lama = await pool.query(`SELECT *, ST_AsGeoJSON(geometry)::json AS geom_json FROM kib_c_bangunan WHERE "NIBAR" = $1`, [nibarParam]);
    const dataLama = lama.rows[0] || {};
    const geomLama = dataLama.geom_json || null;
    const lat = LAT ? parseFloat(LAT) : null;
    const lng = LONG ? parseFloat(LONG) : null;
    const geomSQL = (lat && lng)
      ? `, geometry=ST_SetSRID(ST_MakePoint($11::float8,$10::float8),4326),"LAT"=$10::float8,"LONG"=$11::float8`
      : '';
    await pool.query(`
      UPDATE kib_c_bangunan SET "OPD"=$1,"Nama_Baran"=$2,"Spesifikas"=$3,"Spesifik_1"=$4,"Lokasi"=$5,"DESA_KELUR"=$6,"KECAMATAN"=$7,"Foto_denah"=$8${geomSQL} WHERE "NIBAR"=$9
    `, [OPD,Nama_Baran||null,Spesifikas||null,Spesifik_1||null,Lokasi||null,DESA_KELUR||null,KECAMATAN||null,Foto_denah||null,nibarParam,lat,lng]);
    const geomBaru = (lat && lng) ? { type:'Point', coordinates:[lng,lat] } : geomLama;
    await simpanHistory('kib_c', nibarParam, 'UPDATE', dataLama, req.body, geomLama, geomBaru, username||'admin');
    res.json({ message: 'Data berhasil diperbarui' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

router.delete('/bangunan-kib/:id', async (req, res) => {
  const { username } = req.body || {};
  try {
    const nibarParam = decodeURIComponent(req.params.id);
    const lama = await pool.query(`SELECT *, ST_AsGeoJSON(geometry)::json AS geom_json FROM kib_c_bangunan WHERE "NIBAR" = $1`, [nibarParam]);
    const dataLama = lama.rows[0] || {};
    await pool.query('DELETE FROM kib_c_bangunan WHERE "NIBAR" = $1', [nibarParam]);
    await simpanHistory('kib_c', nibarParam, 'DELETE', dataLama, null, dataLama.geom_json||null, null, username||'admin');
    res.json({ message: 'Data berhasil dihapus' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
