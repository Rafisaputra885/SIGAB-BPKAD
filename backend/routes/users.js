const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const pool    = require('../db/db');
const { requireAuth, requireAdmin } = require('../middleware/authMiddleware');

// Semua route users butuh login + role admin
router.use(requireAuth, requireAdmin);

// GET /api/users — daftar semua user
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, username, nama_lengkap, role, aktif, created_at, last_login
      FROM users ORDER BY id
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/users — tambah user baru
router.post('/', async (req, res) => {
  const { username, password, nama_lengkap, role } = req.body;
  if (!username || !password || !nama_lengkap) {
    return res.status(400).json({ error: 'Username, password, dan nama lengkap wajib diisi.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password minimal 8 karakter.' });
  }
  try {
    const existing = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
    if (existing.rows.length) return res.status(400).json({ error: 'Username sudah digunakan.' });
    const hash = await bcrypt.hash(password, 10);
    const result = await pool.query(`
      INSERT INTO users (username, password_hash, nama_lengkap, role)
      VALUES ($1, $2, $3, $4) RETURNING id
    `, [username.toLowerCase(), hash, nama_lengkap, role || 'editor']);
    res.status(201).json({ id: result.rows[0].id, message: 'User berhasil ditambahkan.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/users/:id/toggle — aktifkan/nonaktifkan user
router.put('/:id/toggle', async (req, res) => {
  try {
    await pool.query(`
      UPDATE users SET aktif = NOT aktif WHERE id = $1
    `, [req.params.id]);
    res.json({ message: 'Status user berhasil diubah.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /api/users/:id — hapus user
router.delete('/:id', async (req, res) => {
  // Tidak boleh hapus diri sendiri
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Tidak dapat menghapus akun sendiri.' });
  }
  try {
    await pool.query('DELETE FROM users WHERE id=$1', [req.params.id]);
    res.json({ message: 'User berhasil dihapus.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
