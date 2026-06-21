// ═══════════════════════════════════════════════════════
//  SIGAB — Seed Admin User
//  Jalankan: node seed_admin.js
//  Letakkan file ini di folder: backend/db/
// ═══════════════════════════════════════════════════════

const bcrypt = require('bcrypt');
const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 5432,
  database: process.env.DB_NAME     || 'webgis_bpkad',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD,
});

async function seedAdmin() {
  // ── Data akun admin awal ──────────────────────────────
  const users = [
    {
      username:     'admin.bpkad',
      password:     'Admin@BPKAD2026',
      nama_lengkap: 'Administrator BPKAD',
      role:         'admin',
    },
    {
      username:     'editor.bpkad',
      password:     'Editor@BPKAD2026',
      nama_lengkap: 'Editor BPKAD Bojonegoro',
      role:         'editor',
    },
  ];

  console.log('🔐 Membuat hash password...');

  for (const u of users) {
    const hash = await bcrypt.hash(u.password, 10);
    console.log(`\nUser   : ${u.username}`);
    console.log(`Hash   : ${hash}`);

    const existing = await pool.query(
      'SELECT id FROM users WHERE username = $1', [u.username]
    );

    if (existing.rows.length > 0) {
      console.log(`⚠  User "${u.username}" sudah ada, skip.`);
      continue;
    }

    await pool.query(
      `INSERT INTO users (username, password_hash, nama_lengkap, role)
       VALUES ($1, $2, $3, $4)`,
      [u.username, hash, u.nama_lengkap, u.role]
    );
    console.log(`✅ User "${u.username}" berhasil dibuat.`);
  }

  console.log('\n✅ Selesai! Akun yang tersedia:');
  const result = await pool.query(
    'SELECT id, username, nama_lengkap, role, aktif FROM users ORDER BY id'
  );
  console.table(result.rows);

  await pool.end();
}

seedAdmin().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
