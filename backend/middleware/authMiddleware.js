// ═══════════════════════════════════════════════════════
//  SIGAB — middleware/authMiddleware.js
//  Proteksi route API yang butuh login admin
// ═══════════════════════════════════════════════════════

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'sigab_secret_ganti_ini_di_env';

// ── Middleware: wajib login ──────────────────────────────
function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Akses ditolak. Silakan login.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;  // tersedia di route handler sebagai req.user
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token tidak valid atau sudah kadaluarsa.' });
  }
}

// ── Middleware: wajib role admin ─────────────────────────
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Akses ditolak. Hanya admin yang diizinkan.' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
