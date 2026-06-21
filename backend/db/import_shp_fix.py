"""
Script import SHP KIB A ke PostGIS menggunakan psycopg2 langsung.
Tidak membutuhkan geoalchemy2.
Jalankan: python import_shp_fix.py "path/ke/KIB_A_FIXX.shp"
"""
import sys
import os
import json
import geopandas as gpd
import psycopg2
from dotenv import load_dotenv

load_dotenv()

if len(sys.argv) < 2:
    print("Penggunaan: python import_shp_fix.py namafile.shp")
    sys.exit(1)

shp_path = sys.argv[1]
print(f"Membaca SHP: {shp_path}")

# ── Baca SHP ──────────────────────────────────────────────
gdf = gpd.read_file(shp_path)
print(f"Jumlah fitur  : {len(gdf)}")
print(f"CRS asli      : {gdf.crs}")

# Pastikan EPSG:4326
if gdf.crs and gdf.crs.to_epsg() != 4326:
    print("Transformasi ke EPSG:4326...")
    gdf = gdf.to_crs(epsg=4326)
print(f"CRS dipakai   : {gdf.crs}")

# Normalisasi nama kolom
gdf.columns = [c.lower().strip() for c in gdf.columns]
print(f"Kolom         : {list(gdf.columns)}")

# Tentukan kolom geometry
geom_col = None
for c in gdf.columns:
    if gdf[c].dtype.name == 'geometry' or c in ('geometry', 'geom'):
        geom_col = c
        break
if not geom_col:
    print("ERROR: kolom geometry tidak ditemukan!")
    sys.exit(1)
print(f"Kolom geometry: {geom_col}")

# ── Koneksi DB ────────────────────────────────────────────
conn = psycopg2.connect(
    host     = os.getenv('DB_HOST', 'localhost'),
    port     = os.getenv('DB_PORT', '5432'),
    dbname   = os.getenv('DB_NAME', 'webgis_bpkad'),
    user     = os.getenv('DB_USER', 'postgres'),
    password = os.getenv('DB_PASSWORD', ''),
)
cur = conn.cursor()

# ── Mapping kolom SHP → kolom DB ─────────────────────────
# sesuaikan kalau nama kolom di SHP berbeda
COL_MAP = {
    'nibar'      : 'nibar',
    'nibar_1'    : 'nibar',
    'nama_baran' : 'nama_barang',
    'nama_baran' : 'nama_barang',
    'opd'        : 'opd',
    'kecamatan'  : 'kecamatan',
    'desa_kelur' : 'desa_kelurahan',
    'alamat'     : 'alamat',
    'luas'       : 'luas_m2',
    'luas_m2'    : 'luas_m2',
    'nama_hak'   : 'nama_hak',
    'nomor_hak'  : 'nomor_hak',
    'nilai_pero' : 'nilai_perolehan',
    'cara_perol' : 'cara_perolehan',
    'keterangan' : 'keterangan',
    'spesifika'  : 'spesifikasi',
    'spesifik_1' : 'spesifikasi_lainnya',
    'latitude'   : 'latitude',
    'longitude'  : 'longitude',
    'lat'        : 'latitude',
    'long'       : 'longitude',
}

sukses = 0
error  = 0

for idx, row in gdf.iterrows():
    geom = row[geom_col]
    if geom is None or geom.is_empty:
        print(f"  Skip baris {idx}: geometry kosong")
        continue

    # Ambil GeoJSON geometry
    geom_json = json.dumps(geom.__geo_interface__)

    # Cari NIBAR dari baris
    nibar = None
    for col in ['nibar', 'nibar_1']:
        if col in row.index and row[col]:
            nibar = str(row[col]).strip()
            break

    if not nibar:
        print(f"  Skip baris {idx}: NIBAR kosong")
        continue

    # Cari kolom lain
    def get(col_aliases):
        for a in col_aliases:
            if a in row.index and row[a] is not None:
                v = row[a]
                if hasattr(v, 'item'): v = v.item()
                return str(v).strip() if isinstance(v, str) else v
        return None

    nama_barang         = get(['nama_baran','nama_barang'])
    opd                 = get(['opd'])
    kecamatan           = get(['kecamatan'])
    desa_kelurahan      = get(['desa_kelur','desa_kelurahan'])
    alamat              = get(['alamat','lokasi'])
    luas_m2             = get(['luas','luas_m2'])
    nama_hak            = get(['nama_hak'])
    nomor_hak           = get(['nomor_hak'])
    nilai_perolehan     = get(['nilai_pero','nilai_perolehan'])
    cara_perolehan      = get(['cara_perol','cara_perolehan'])
    keterangan          = get(['keterangan'])
    spesifikasi         = get(['spesifika','spesifikasi'])
    spesifikasi_lainnya = get(['spesifik_1','spesifikasi_lainnya'])
    latitude            = get(['lat','latitude'])
    longitude           = get(['long','longitude'])

    try:
        # Cek apakah NIBAR sudah ada di DB
        cur.execute("SELECT id_tanah FROM kib_a_tanah WHERE nibar = %s", (nibar,))
        existing = cur.fetchone()

        if existing:
            # UPDATE geometry + atribut
            cur.execute("""
                UPDATE kib_a_tanah SET
                    geom                = ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326),
                    nama_barang         = COALESCE(%s, nama_barang),
                    opd                 = COALESCE(%s, opd),
                    kecamatan           = COALESCE(%s, kecamatan),
                    desa_kelurahan      = COALESCE(%s, desa_kelurahan),
                    alamat              = COALESCE(%s, alamat),
                    luas_m2             = COALESCE(%s::numeric, luas_m2),
                    nama_hak            = COALESCE(%s, nama_hak),
                    nomor_hak           = COALESCE(%s, nomor_hak),
                    spesifikasi         = COALESCE(%s, spesifikasi),
                    spesifikasi_lainnya = COALESCE(%s, spesifikasi_lainnya),
                    updated_at          = NOW()
                WHERE nibar = %s
            """, (
                geom_json, nama_barang, opd, kecamatan, desa_kelurahan,
                alamat, luas_m2, nama_hak, nomor_hak,
                spesifikasi, spesifikasi_lainnya, nibar
            ))
            print(f"  UPDATE nibar={nibar}")
        else:
            # INSERT baru
            cur.execute("""
                INSERT INTO kib_a_tanah
                    (nibar, nama_barang, opd, kecamatan, desa_kelurahan,
                     alamat, luas_m2, nama_hak, nomor_hak,
                     spesifikasi, spesifikasi_lainnya,
                     latitude, longitude, geom)
                VALUES (%s,%s,%s,%s,%s,%s,%s::numeric,%s,%s,%s,%s,%s,%s,
                        ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326))
            """, (
                nibar, nama_barang, opd, kecamatan, desa_kelurahan,
                alamat, luas_m2, nama_hak, nomor_hak,
                spesifikasi, spesifikasi_lainnya,
                latitude, longitude, geom_json
            ))
            print(f"  INSERT nibar={nibar}")

        sukses += 1

    except Exception as e:
        error += 1
        print(f"  ERROR baris {idx} nibar={nibar}: {e}")
        conn.rollback()
        continue

conn.commit()

# Verifikasi
cur.execute("SELECT COUNT(*) FROM kib_a_tanah WHERE geom IS NOT NULL")
total_geom = cur.fetchone()[0]

cur.close()
conn.close()

print(f"\n=== Selesai ===")
print(f"  Berhasil          : {sukses} polygon")
print(f"  Error             : {error}")
print(f"  Total punya geom  : {total_geom} baris di DB")
