import geopandas as gpd
import psycopg2
from sqlalchemy import create_engine, text

# Baca SHP
gdf = gpd.read_file(r"C:\Users\Rafi Saputra\Documents\Tugas Akhir\WebGIS\Pengolahan\DATA TANAH ASET\SHP ASET TANAH\KIB_C\kib_c_bangunan.shp")
print(gdf.dtypes)
print(f"Total fitur: {len(gdf)}")

# Pastikan CRS benar
gdf = gdf.set_crs("EPSG:4326", allow_override=True)

# Koneksi ke PostGIS
engine = create_engine('postgresql://postgres:Rafigans8@localhost:5432/webgis_bpkad')

# Import ke tabel kib_c_bangunan
gdf.to_postgis(
    name='kib_c_bangunan',
    con=engine,
    if_exists='replace',   # ganti 'append' kalau tabel sudah ada dan mau ditambah
    index=False,
    dtype={'geometry': 'POINT'}
)
print("Import selesai!")