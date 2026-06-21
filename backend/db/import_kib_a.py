"""
Script import data KIB A dari file Excel BPKAD Bojonegoro ke PostgreSQL.
Jalankan: python import_kib_a.py path/ke/file.xlsx

Dependensi: pip install openpyxl psycopg2-binary python-dotenv
"""

import sys
import os
import openpyxl
import psycopg2
from datetime import datetime, date
from dotenv import load_dotenv

load_dotenv()

# ── Koneksi database ─────────────────────────────────────────
conn = psycopg2.connect(
    host     = os.getenv('DB_HOST', 'localhost'),
    port     = os.getenv('DB_PORT', '5432'),
    dbname   = os.getenv('DB_NAME', 'webgis_bpkad'),
    user     = os.getenv('DB_USER', 'postgres'),
    password = os.getenv('DB_PASSWORD', ''),
)
cur = conn.cursor()

# ── Baca file Excel ──────────────────────────────────────────
if len(sys.argv) < 2:
    print("Penggunaan: python import_kib_a.py namafile.xlsx")
    sys.exit(1)

filepath = sys.argv[1]
print(f"Membaca file: {filepath}")

wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
ws = wb.active

def clean(val):
    """Bersihkan nilai: strip string, None jika kosong/0."""
    if val is None:
        return None
    if isinstance(val, str):
        val = val.strip()
        return val if val else None
    return val

def to_date(val):
    """Konversi nilai Excel ke date Python."""
    if val is None:
        return None
    if isinstance(val, (datetime, date)):
        return val.date() if isinstance(val, datetime) else val
    return None

def to_float(val):
    """Konversi ke float, return None jika 0 atau None."""
    try:
        f = float(val)
        return None if f == 0 else f
    except (TypeError, ValueError):
        return None

# ── Mapping kolom Excel (index 0-based dari row data) ────────
# Urutan kolom: NO(0), OPD(1), KD(2), KD0(3), KD1(4), KD2(5),
# KD3(6), KD4(7), KD5(8), Nama Barang(9), NIBAR(10),
# Nomor Register(11), Spesifikasi(12), Spesifikasi Lainnya(13),
# LUAS(14), Satuan(15), Lokasi(16), DESA(17), KECAMATAN(18),
# Titik Koordinat(19), Nama HAK(20), Nomor HAK(21),
# Tanggal HAK(22), Nama Kepemilikan(23), Harga Satuan(24),
# Nilai Perolehan(25), Cara Perolehan(26), Tanggal Perolehan(27),
# Status Penggunaan(28), Keterangan(29), LAT LNG(30),
# LAT(31), LONG(32), MAPS(33), Foto(34)

SQL = """
INSERT INTO kib_a_tanah (
  nibar, nomor_register, opd, nama_barang,
  spesifikasi, spesifikasi_lainnya,
  alamat, desa_kelurahan, kecamatan,
  latitude, longitude,
  luas_m2, satuan,
  nama_hak, nomor_hak, tanggal_hak, nama_kepemilikan_dok,
  nilai_perolehan, cara_perolehan, tanggal_perolehan,
  status_penggunaan, keterangan, url_foto
)
VALUES (
  %s,%s,%s,%s,%s,%s,
  %s,%s,%s,%s,%s,
  %s,%s,
  %s,%s,%s,%s,
  %s,%s,%s,
  %s,%s,%s
)
ON CONFLICT (nibar) DO UPDATE SET
  opd                 = EXCLUDED.opd,
  nama_barang         = EXCLUDED.nama_barang,
  spesifikasi         = EXCLUDED.spesifikasi,
  spesifikasi_lainnya = EXCLUDED.spesifikasi_lainnya,
  alamat              = EXCLUDED.alamat,
  desa_kelurahan      = EXCLUDED.desa_kelurahan,
  kecamatan           = EXCLUDED.kecamatan,
  latitude            = EXCLUDED.latitude,
  longitude           = EXCLUDED.longitude,
  luas_m2             = EXCLUDED.luas_m2,
  nama_hak            = EXCLUDED.nama_hak,
  nomor_hak           = EXCLUDED.nomor_hak,
  tanggal_hak         = EXCLUDED.tanggal_hak,
  nilai_perolehan     = EXCLUDED.nilai_perolehan,
  cara_perolehan      = EXCLUDED.cara_perolehan,
  tanggal_perolehan   = EXCLUDED.tanggal_perolehan,
  status_penggunaan   = EXCLUDED.status_penggunaan,
  keterangan          = EXCLUDED.keterangan,
  url_foto            = EXCLUDED.url_foto,
  updated_at          = NOW()
"""

sukses = 0
skip   = 0
error  = 0
DATA_START_ROW = 11   # baris data pertama di Excel (1-based = row 11)

for i, row in enumerate(ws.iter_rows(min_row=DATA_START_ROW, values_only=True)):
    # Skip baris kosong
    if not row or row[0] is None:
        skip += 1
        continue

    nibar = clean(row[10])
    if not nibar:
        skip += 1
        continue

    lat  = to_float(row[31])
    long = to_float(row[32])

    params = (
        nibar,
        clean(row[11]),                # nomor_register
        clean(row[1]),                 # opd
        clean(row[9]),                 # nama_barang
        clean(row[12]),                # spesifikasi
        clean(row[13]),                # spesifikasi_lainnya
        clean(row[16]),                # alamat
        clean(row[17]),                # desa_kelurahan
        clean(row[18]),                # kecamatan
        lat,                           # latitude
        long,                          # longitude
        to_float(row[14]),             # luas_m2
        clean(row[15]) or 'Meter Persegi',
        clean(row[20]),                # nama_hak
        clean(row[21]),                # nomor_hak
        to_date(row[22]),              # tanggal_hak
        clean(row[23]),                # nama_kepemilikan_dok
        clean(row[25]),                # nilai_perolehan
        clean(row[26]),                # cara_perolehan
        to_date(row[27]),              # tanggal_perolehan
        clean(row[28]),                # status_penggunaan
        clean(row[29]),                # keterangan
        clean(row[34]),                # url_foto
    )

    try:
        cur.execute(SQL, params)
        sukses += 1
        if sukses % 100 == 0:
            print(f"  {sukses} baris diimport...")
    except Exception as e:
        error += 1
        print(f"  ERROR baris {DATA_START_ROW + i}: {e} | nibar={nibar}")
        conn.rollback()
        continue

conn.commit()
cur.close()
conn.close()

print(f"\n=== Selesai ===")
print(f"  Berhasil : {sukses} baris")
print(f"  Dilewati : {skip} baris (kosong/tanpa NIBAR)")
print(f"  Error    : {error} baris")
print(f"\nVerifikasi: SELECT COUNT(*) FROM kib_a_tanah;")
