const express  = require('express');
const router   = express.Router();
const pool     = require('../db/db');
const ExcelJS  = require('exceljs');

// ── Helper style header ────────────────────────────────────────
function styleHeader(ws) {
  ws.getRow(1).eachCell(cell => {
    cell.font      = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border    = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });
  ws.getRow(1).height = 30;
}

function styleDataRow(row) {
  row.eachCell({ includeEmpty: true }, cell => {
    cell.border = {
      top: { style: 'hair' }, bottom: { style: 'hair' },
      left: { style: 'hair' }, right: { style: 'hair' },
    };
    cell.alignment = { vertical: 'middle', wrapText: false };
    cell.font = { size: 10 };
  });
}

// GET /api/laporan/tanah — ekspor KIB A ke Excel
router.get('/tanah', async (req, res) => {
  const { kecamatan } = req.query;
  const params  = [];
  const filters = [];
  if (kecamatan) { params.push(kecamatan); filters.push(`kecamatan = $${params.length}`); }
  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  try {
    const result = await pool.query(`
      SELECT
        nibar, opd, nama_barang, spesifikasi, spesifikasi_lainnya,
        luas_m2, satuan, alamat, desa_kelurahan, kecamatan,
        nama_hak, nomor_hak, nilai_perolehan, cara_perolehan,
        status_penggunaan, keterangan
      FROM kib_a_tanah
      ${where}
      ORDER BY kecamatan, opd, nibar
    `, params);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'WebGIS BPKAD Bojonegoro';
    wb.created = new Date();
    const ws = wb.addWorksheet('KIB A - Tanah');

    ws.columns = [
      { header: 'NIBAR',                key: 'nibar',               width: 48 },
      { header: 'OPD',                  key: 'opd',                 width: 35 },
      { header: 'Nama Barang',          key: 'nama_barang',         width: 30 },
      { header: 'Spesifikasi',          key: 'spesifikasi',         width: 30 },
      { header: 'Spesifikasi Lainnya',  key: 'spesifikasi_lainnya', width: 30 },
      { header: 'Luas (m²)',            key: 'luas_m2',             width: 14 },
      { header: 'Satuan',               key: 'satuan',              width: 16 },
      { header: 'Alamat / Lokasi',      key: 'alamat',              width: 40 },
      { header: 'Desa / Kelurahan',     key: 'desa_kelurahan',      width: 20 },
      { header: 'Kecamatan',            key: 'kecamatan',           width: 18 },
      { header: 'Nama HAK',             key: 'nama_hak',            width: 14 },
      { header: 'Nomor HAK',            key: 'nomor_hak',           width: 14 },
      { header: 'Nilai Perolehan (Rp)', key: 'nilai_perolehan',     width: 22 },
      { header: 'Cara Perolehan',       key: 'cara_perolehan',      width: 20 },
      { header: 'Status Penggunaan',    key: 'status_penggunaan',   width: 30 },
      { header: 'Keterangan',           key: 'keterangan',          width: 35 },
    ];

    styleHeader(ws);

    let totalLuas = 0;
    result.rows.forEach(row => {
      const r = ws.addRow({
        nibar:               row.nibar               || '-',
        opd:                 row.opd                 || '-',
        nama_barang:         row.nama_barang         || '-',
        spesifikasi:         row.spesifikasi         || '-',
        spesifikasi_lainnya: row.spesifikasi_lainnya || '-',
        luas_m2:             parseFloat(row.luas_m2) || 0,
        satuan:              row.satuan              || 'Meter Persegi',
        alamat:              row.alamat              || '-',
        desa_kelurahan:      row.desa_kelurahan      || '-',
        kecamatan:           row.kecamatan           || '-',
        nama_hak:            row.nama_hak            || '-',
        nomor_hak:           row.nomor_hak           || '-',
        nilai_perolehan:     parseFloat(row.nilai_perolehan) || 0,
        cara_perolehan:      row.cara_perolehan      || '-',
        status_penggunaan:   row.status_penggunaan   || '-',
        keterangan:          row.keterangan          || '-',
      });
      styleDataRow(r);
      r.getCell('luas_m2').numFmt        = '#,##0.00';
      r.getCell('nilai_perolehan').numFmt = '#,##0';
      totalLuas += parseFloat(row.luas_m2) || 0;
    });

    const totalRow = ws.addRow({ nibar: 'TOTAL', luas_m2: totalLuas });
    totalRow.getCell(1).font   = { bold: true, size: 10 };
    totalRow.getCell(6).font   = { bold: true, size: 10 };
    totalRow.getCell(6).numFmt = '#,##0.00';
    totalRow.getCell(6).fill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

    ws.views      = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: 'A1', to: 'P1' };

    res.setHeader('Content-Type',        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=KIB_A_Tanah_${new Date().toISOString().slice(0,10)}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/laporan/bangunan — ekspor KIB C ke Excel
// Menggunakan nama kolom hasil import SHP dari ArcGIS Pro
router.get('/bangunan', async (req, res) => {
  const { kecamatan } = req.query;
  const params  = [];
  const filters = [];
  if (kecamatan) {
    params.push(kecamatan);
    filters.push(`"KECAMATAN" = $${params.length}`);
  }
  const where = filters.length ? 'WHERE ' + filters.join(' AND ') : '';

  try {
    const result = await pool.query(`
      SELECT
        "NIBAR"       AS nibar,
        "OPD"         AS opd,
        "Nama_Baran"  AS nama_barang,
        "Spesifikas"  AS spesifikasi,
        "Spesifik_1"  AS spesifikasi_lainnya,
        "Lokasi"      AS lokasi,
        "DESA_KELUR"  AS desa_kelurahan,
        "KECAMATAN"   AS kecamatan,
        "LAT"         AS lat,
        "LONG"        AS long,
        "Foto_denah"  AS foto_denah
      FROM kib_c_bangunan
      ${where}
      ORDER BY "KECAMATAN", "OPD", "NIBAR"
    `, params);

    const wb = new ExcelJS.Workbook();
    wb.creator = 'WebGIS BPKAD Bojonegoro';
    wb.created = new Date();
    const ws = wb.addWorksheet('KIB C - Bangunan');

    ws.columns = [
      { header: 'NIBAR',               key: 'nibar',               width: 48 },
      { header: 'OPD',                 key: 'opd',                 width: 35 },
      { header: 'Nama Barang',         key: 'nama_barang',         width: 35 },
      { header: 'Spesifikasi',         key: 'spesifikasi',         width: 30 },
      { header: 'Spesifikasi Lainnya', key: 'spesifikasi_lainnya', width: 30 },
      { header: 'Lokasi',              key: 'lokasi',              width: 40 },
      { header: 'Desa / Kelurahan',    key: 'desa_kelurahan',      width: 20 },
      { header: 'Kecamatan',           key: 'kecamatan',           width: 18 },
      { header: 'Latitude',            key: 'lat',                 width: 16 },
      { header: 'Longitude',           key: 'long',                width: 16 },
      { header: 'Foto / Denah',        key: 'foto_denah',          width: 60 },
    ];

    styleHeader(ws);

    result.rows.forEach(row => {
      const r = ws.addRow({
        nibar:               row.nibar               || '-',
        opd:                 row.opd                 || '-',
        nama_barang:         row.nama_barang         || '-',
        spesifikasi:         row.spesifikasi         || '-',
        spesifikasi_lainnya: row.spesifikasi_lainnya || '-',
        lokasi:              row.lokasi              || '-',
        desa_kelurahan:      row.desa_kelurahan      || '-',
        kecamatan:           row.kecamatan           || '-',
        lat:                 parseFloat(row.lat)     || 0,
        long:                parseFloat(row.long)    || 0,
        foto_denah:          row.foto_denah          || '',
      });
      styleDataRow(r);
      r.getCell('lat').numFmt  = '0.000000';
      r.getCell('long').numFmt = '0.000000';

      // Buat link foto bisa diklik di Excel
      if (row.foto_denah && row.foto_denah.startsWith('http')) {
        r.getCell('foto_denah').value = {
          text: 'Lihat Foto',
          hyperlink: row.foto_denah,
        };
        r.getCell('foto_denah').font = { color: { argb: 'FF0563C1' }, underline: true, size: 10 };
      }
    });

    // Baris total
    const totalRow = ws.addRow({ nibar: `TOTAL: ${result.rows.length} aset bangunan` });
    totalRow.getCell(1).font = { bold: true, size: 10 };
    totalRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

    ws.views      = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: 'A1', to: 'K1' };

    res.setHeader('Content-Type',        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=KIB_C_Bangunan_${new Date().toISOString().slice(0,10)}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
