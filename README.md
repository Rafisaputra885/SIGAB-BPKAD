# WebGIS Pengelolaan Aset BPKAD Kabupaten Bojonegoro

## Struktur Proyek

```
webgis-aset-bpkad/
├── README.md
│
├── backend/                  ← Node.js + Express API
│   ├── server.js             ← Entry point server
│   ├── package.json          ← Dependensi Node.js
│   ├── .env.example          ← Template konfigurasi database
│   ├── db/
│   │   ├── db.js             ← Koneksi pool PostgreSQL
│   │   └── schema.sql        ← DDL tabel PostGIS (jalankan sekali)
│   └── routes/
│       ├── aset.js           ← CRUD KIB A (tanah) & KIB C (bangunan)
│       ├── geojson.js        ← Layer spasial untuk LeafletJS
│       ├── statistik.js      ← Rekap total & per kecamatan
│       └── laporan.js        ← Ekspor Excel KIB A & KIB C
│
└── frontend/                 ← Antarmuka web (satu file)
    ├── index.html            ← HTML + CSS + JS digabung dalam satu file
    └── admin/                ← Halaman admin (form tambah/edit aset)
```

## Cara Menjalankan

### 1. Persiapan Database

```bash
psql -U postgres -c "CREATE DATABASE webgis_bpkad;"
psql -U postgres -d webgis_bpkad -f backend/db/schema.sql
```

### 2. Konfigurasi Backend

```bash
cd backend
cp .env.example .env
# Edit .env → isi DB_HOST, DB_NAME, DB_USER, DB_PASSWORD
```

### 3. Install & Jalankan

```bash
cd backend
npm install
npm start
# Buka http://localhost:3000
```

## API Endpoints

| Method | Endpoint                 | Fungsi                       |
|--------|--------------------------|------------------------------|
| GET    | /api/geojson/tanah       | Layer polygon tanah          |
| GET    | /api/geojson/bangunan    | Layer titik bangunan         |
| GET    | /api/geojson/wilayah     | Batas kecamatan              |
| GET    | /api/aset/tanah          | Daftar aset tanah (paginasi) |
| GET    | /api/aset/tanah/:id      | Detail satu aset tanah       |
| POST   | /api/aset/tanah          | Tambah aset tanah            |
| PUT    | /api/aset/tanah/:id      | Edit aset tanah              |
| DELETE | /api/aset/tanah/:id      | Hapus aset tanah             |
| GET    | /api/aset/bangunan       | Daftar bangunan (paginasi)   |
| GET    | /api/aset/bangunan/:id   | Detail satu bangunan         |
| POST   | /api/aset/bangunan       | Tambah bangunan              |
| PUT    | /api/aset/bangunan/:id   | Edit bangunan                |
| DELETE | /api/aset/bangunan/:id   | Hapus bangunan               |
| GET    | /api/statistik           | Ringkasan keseluruhan        |
| GET    | /api/statistik/kecamatan | Rekap per kecamatan          |
| GET    | /api/statistik/kondisi   | Distribusi kondisi aset      |
| GET    | /api/laporan/tanah       | Ekspor KIB A ke Excel        |
| GET    | /api/laporan/bangunan    | Ekspor KIB C ke Excel        |

## Teknologi

- **Backend** : Node.js, Express, pg (node-postgres), ExcelJS
- **Database** : PostgreSQL + PostGIS
- **Frontend** : HTML, CSS, JavaScript, LeafletJS (CDN)
- **Basemap**  : OpenStreetMap (gratis, tanpa API key)
