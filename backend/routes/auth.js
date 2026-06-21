// ═══════════════════════════════════════════════════════
//  SIGAB — routes/auth.js
//  Endpoint: POST /api/auth/login
//            GET  /api/auth/me
//            POST /api/auth/logout
// ═══════════════════════════════════════════════════════

const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const pool    = require('../db/db');

const JWT_SECRET  = process.env.JWT_SECRET  || 'sigab_secret_ganti_ini_di_env';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '8h';  // token berlaku 8 jam

// ── POST /api/auth/login ─────────────────────────────────
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi.' });
  }

  try {
    // Cari user
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 AND aktif = true',
      [username.trim().toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }

    const user = result.rows[0];

    // Verifikasi password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Username atau password salah.' });
    }

    // Update last_login
    await pool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    // Buat JWT
    const token = jwt.sign(
      {
        id:           user.id,
        username:     user.username,
        nama_lengkap: user.nama_lengkap,
        role:         user.role,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      token,
      user: {
        id:           user.id,
        username:     user.username,
        nama_lengkap: user.nama_lengkap,
        role:         user.role,
      },
    });

  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// ── GET /api/auth/me ─────────────────────────────────────
// Cek token masih valid (dipakai halaman admin saat load)
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) return res.status(401).json({ error: 'Token tidak ditemukan.' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Cek user masih aktif di DB
    const result = await pool.query(
      'SELECT id, username, nama_lengkap, role, aktif FROM users WHERE id = $1',
      [decoded.id]
    );

    if (!result.rows.length || !result.rows[0].aktif) {
      return res.status(401).json({ error: 'Akun tidak aktif.' });
    }

    res.json({ user: result.rows[0] });
  } catch (err) {
    return res.status(401).json({ error: 'Token tidak valid atau sudah kadaluarsa.' });
  }
});

// ── POST /api/auth/logout ────────────────────────────────
// Logout hanya di sisi klien (hapus token), endpoint ini opsional
router.post('/logout', (req, res) => {
  res.json({ message: 'Logout berhasil.' });
});

module.exports = router;
