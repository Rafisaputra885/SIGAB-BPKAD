"""
Script import SHP KIB A hasil digitasi + join atribut ke PostGIS.
Jalankan: python import_kib_a_shp.py path/ke/kib_a_digitasi_final.shp

Dependensi: pip install geopandas psycopg2-binary python-dotenv sqlalchemy
"""
import sys, os
import geopandas as gpd
import pandas as pd
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()

DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = os.getenv('DB_PORT', '5432')
DB_NAME = os.getenv('DB_NAME', 'webgis_bpkad')
DB_USER = os.getenv('DB_USER', 'postgres')
DB_PASS = os.getenv('DB_PASSWORD', '')

if len(sys.argv) < 2:
    print("Penggunaan: python import_kib_a_shp.py namafile.shp")
    sys.exit(1)

shp_path = sys.argv[1]
print(f"Membaca SHP: {shp_path}")

# ── Baca SHP ──────────────────────────────────────────────────
gdf = gpd.read_file(shp_path)
print(f"Jumlah fitur   : {len(gdf)}")
print(f"Kolom          : {list(gdf.columns)}")
print(f"CRS            : {gdf.crs}")

# ── Transformasi ke EPSG:4326 ─────────────────────────────────
if gdf.crs is None:
    print("CRS tidak ditemukan, diasumsikan EPSG:4326")
    gdf = gdf.set_crs(epsg=4326)
elif gdf.crs.to_epsg() != 4326:
    print(f"Transformasi dari {gdf.crs} ke EPSG:4326...")
    gdf = gdf.to_crs(epsg=4326)

# ── Normalisasi nama kolom (lowercase, hapus spasi) ───────────
gdf.columns = [c.strip().lower().replace(' ', '_').replace('/', '_') for c in gdf.columns]
print(f"Kolom setelah normalisasi: {list(gdf.columns)}")

# ── Mapping kolom SHP → kolom tabel kib_a_tanah ──────────────
# Sesuaikan jika nama kolom di SHP kamu berbeda
col_map = {
    'nibar'          : 'nibar',
    'opd'            : 'opd',
    'nama_barang'    : 'nama_barang',
    'spesifikasi_lainnya' : 'spesifikasi_lainnya',
    'spesifikasi_nama_barang' : 'spesifikasi',
    'luas'           : 'luas_m2',
    'lokasi'         : 'alamat',
    'desa_kelurahan' : 'desa_kelurahan',
    'kecamatan'      : 'kecamatan',
    'nama_hak'       : 'nama_hak',
    'nomor_hak'      : 'nomor_hak',
    'nilai_perolehan': 'nilai_perolehan',
    'cara_perolehan' : 'cara_perolehan',
    'lat'            : 'latitude',
    'long'           : 'longitude',
    'keterangan'     : 'keterangan',
    'geometry'       : 'geom',
}

# Rename kolom yang ada saja
rename = {k: v for k, v in col_map.items() if k in gdf.columns}
gdf = gdf.rename(columns=rename)
print(f"Kolom setelah rename: {list(gdf.columns)}")

# ── Koneksi ke PostgreSQL/PostGIS ─────────────────────────────
conn_str = f"postgresql://{DB_USER}:{DB_PASS}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(conn_str)

# ── Hapus data lama (opsional) ────────────────────────────────
with engine.connect() as con:
    result = con.execute(text("SELECT COUNT(*) FROM kib_a_tanah WHERE geom IS NOT NULL"))
    existing = result.scalar()
    print(f"\nData polygon yang sudah ada di DB : {existing} baris")

konfirm = input("Hapus data lama yang ada geometry-nya dan ganti dengan SHP baru? (y/n): ")
if konfirm.lower() == 'y':
    with engine.connect() as con:
        con.execute(text("DELETE FROM kib_a_tanah WHERE geom IS NOT NULL"))
        con.commit()
    print("Data lama dihapus.")

# ── Import ke PostGIS ─────────────────────────────────────────
print("\nMengimport ke PostGIS...")
gdf_import = gdf.copy()

# Pastikan kolom geometry bernama 'geom'
if 'geometry' in gdf_import.columns:
    gdf_import = gdf_import.rename_geometry('geom')

try:
    gdf_import.to_postgis(
        name='kib_a_tanah',
        con=engine,
        if_exists='append',
        index=False,
        chunksize=100,
    )
    print(f"\n✅ Berhasil import {len(gdf_import)} fitur ke tabel kib_a_tanah")
except Exception as e:
    print(f"\n❌ Error: {e}")
    print("\nCoba jalankan SQL ini di pgAdmin untuk cek struktur tabel:")
    print("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='kib_a_tanah';")
    sys.exit(1)

# ── Verifikasi ────────────────────────────────────────────────
with engine.connect() as con:
    result = con.execute(text("SELECT COUNT(*) FROM kib_a_tanah"))
    total = result.scalar()
    result2 = con.execute(text("SELECT COUNT(*) FROM kib_a_tanah WHERE geom IS NOT NULL"))
    with_geom = result2.scalar()

print(f"\n=== Verifikasi ===")
print(f"  Total baris     : {total}")
print(f"  Punya geometry  : {with_geom}")
print(f"\nBuka pgAdmin → SELECT * FROM kib_a_tanah LIMIT 5; untuk cek")
