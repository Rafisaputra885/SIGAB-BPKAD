-- ============================================================
-- WebGIS Aset BPKAD Kabupaten Bojonegoro
-- Schema disesuaikan dengan data Excel KIB A real
-- ============================================================

CREATE EXTENSION IF NOT EXISTS postgis;

-- ── Tabel wilayah administrasi ───────────────────────────────
CREATE TABLE IF NOT EXISTS wilayah_administrasi (
  id_wilayah     SERIAL PRIMARY KEY,
  kode_wilayah   VARCHAR(20) UNIQUE NOT NULL,
  nama_kecamatan VARCHAR(100),
  nama_desa      VARCHAR(100),
  geom           GEOMETRY(MULTIPOLYGON, 4326)
);
CREATE INDEX IF NOT EXISTS idx_wilayah_geom
  ON wilayah_administrasi USING GIST(geom);

-- ── Tabel KIB A (Tanah) ──────────────────────────────────────
-- Kolom disesuaikan langsung dari Excel BPKAD Bojonegoro
CREATE TABLE IF NOT EXISTS kib_a_tanah (

  -- Identitas
  id_tanah             SERIAL PRIMARY KEY,
  nibar                VARCHAR(60)  UNIQUE,       -- kolom NIBAR (Nomor Induk Barang)
  nomor_register       VARCHAR(60),               -- kolom Nomor Register
  opd                  VARCHAR(150),              -- Organisasi Perangkat Daerah pemegang
  nama_barang          VARCHAR(200),              -- jenis tanah (Tanah Bangunan Kantor, dsb)
  spesifikasi          VARCHAR(200),              -- Spesifikasi Nama Barang
  spesifikasi_lainnya  VARCHAR(200),              -- nama spesifik gedung/lokasi

  -- Lokasi
  alamat               TEXT,                      -- kolom Lokasi (alamat lengkap)
  desa_kelurahan       VARCHAR(100),              -- kolom DESA/KELURAHAN
  kecamatan            VARCHAR(100),              -- kolom KECAMATAN
  latitude             DOUBLE PRECISION,          -- kolom LAT
  longitude            DOUBLE PRECISION,          -- kolom LONG
  geom                 GEOMETRY(POINT, 4326),     -- dibuat otomatis dari lat/long

  -- Data fisik
  luas_m2              NUMERIC(12,3),             -- kolom LUAS
  satuan               VARCHAR(30) DEFAULT 'Meter Persegi',

  -- Hak kepemilikan
  nama_hak             VARCHAR(80),               -- kolom Nama HAK (Hak Pakai, dsb)
  nomor_hak            VARCHAR(80),               -- kolom Nomor HAK
  tanggal_hak          DATE,                      -- kolom Tanggal HAK
  nama_kepemilikan_dok VARCHAR(200),              -- Nama Kepemilikan dalam Dokumen

  -- Perolehan & nilai
  nilai_perolehan      BIGINT,                    -- kolom Nilai Perolehan (Rp)
  cara_perolehan       VARCHAR(80),               -- Pengadaan APBD / Hibah / dsb
  tanggal_perolehan    DATE,                      -- kolom Tanggal Perolehan
  status_penggunaan    VARCHAR(200),              -- kolom Status Penggunaan (nama OPD pengguna)

  -- Tambahan
  keterangan           TEXT,                      -- kolom Keterangan
  url_foto             TEXT,                      -- kolom Foto/denah (link Google Drive)
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tanah_geom      ON kib_a_tanah USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_tanah_kecamatan ON kib_a_tanah(kecamatan);
CREATE INDEX IF NOT EXISTS idx_tanah_opd       ON kib_a_tanah(opd);

-- ── Tabel KIB C (Bangunan) ───────────────────────────────────
-- Geometri POINT karena hanya punya koordinat titik tengah
CREATE TABLE IF NOT EXISTS kib_c_bangunan (

  id_bangunan          SERIAL PRIMARY KEY,
  nibar                VARCHAR(60) UNIQUE,
  nomor_register       VARCHAR(60),
  opd                  VARCHAR(150),
  nama_bangunan        VARCHAR(200),
  spesifikasi          VARCHAR(200),
  spesifikasi_lainnya  VARCHAR(200),

  -- Relasi ke tanah (opsional, jika bisa dicocokkan)
  id_tanah             INT REFERENCES kib_a_tanah(id_tanah),

  -- Lokasi
  alamat               TEXT,
  desa_kelurahan       VARCHAR(100),
  kecamatan            VARCHAR(100),
  latitude             DOUBLE PRECISION,
  longitude            DOUBLE PRECISION,
  geom                 GEOMETRY(POINT, 4326),

  -- Data fisik
  luas_lantai_m2       NUMERIC(12,3),
  jumlah_lantai        INT,
  tahun_dibangun       INT,

  -- Hak & perolehan
  nama_hak             VARCHAR(80),
  nomor_hak            VARCHAR(80),
  tanggal_hak          DATE,
  nilai_perolehan      BIGINT,
  cara_perolehan       VARCHAR(80),
  tanggal_perolehan    DATE,
  status_penggunaan    VARCHAR(200),
  kondisi              VARCHAR(50),

  keterangan           TEXT,
  url_foto             TEXT,
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bangunan_geom ON kib_c_bangunan USING GIST(geom);

-- ── Trigger: update geom otomatis dari lat/long ──────────────
CREATE OR REPLACE FUNCTION fn_update_geom_tanah()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL
     AND NEW.latitude != 0 AND NEW.longitude != 0 THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_geom_tanah ON kib_a_tanah;
CREATE TRIGGER trg_geom_tanah
  BEFORE INSERT OR UPDATE ON kib_a_tanah
  FOR EACH ROW EXECUTE FUNCTION fn_update_geom_tanah();

-- Trigger sama untuk bangunan
CREATE OR REPLACE FUNCTION fn_update_geom_bangunan()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL
     AND NEW.latitude != 0 AND NEW.longitude != 0 THEN
    NEW.geom := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_geom_bangunan ON kib_c_bangunan;
CREATE TRIGGER trg_geom_bangunan
  BEFORE INSERT OR UPDATE ON kib_c_bangunan
  FOR EACH ROW EXECUTE FUNCTION fn_update_geom_bangunan();
