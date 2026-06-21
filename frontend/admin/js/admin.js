// ═══════════════════════════════════════════════════════
//  SIGAB — admin/js/admin.js
//  Helper bersama untuk semua halaman admin
//  Include di setiap halaman admin: <script src="/admin/js/admin.js"></script>
// ═══════════════════════════════════════════════════════

// ── Auth ─────────────────────────────────────────────────
function getToken()   { return localStorage.getItem('sigab_token'); }
function getUser()    {
  try { return JSON.parse(localStorage.getItem('sigab_user')) || {}; }
  catch { return {}; }
}
function isAdmin()    { return getUser().role === 'admin'; }

// Panggil di awal setiap halaman admin
async function requireLogin() {
  const token = getToken();
  if (!token) { redirectLogin(); return null; }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) { redirectLogin(); return null; }
    const data = await res.json();
    // Update localStorage dengan data terbaru
    localStorage.setItem('sigab_user', JSON.stringify(data.user));
    return data.user;
  } catch {
    redirectLogin();
    return null;
  }
}

function redirectLogin() {
  localStorage.removeItem('sigab_token');
  localStorage.removeItem('sigab_user');
  window.location.replace('/admin/login.html');
}

function logout() {
  if (!confirm('Yakin ingin keluar dari panel admin?')) return;
  localStorage.removeItem('sigab_token');
  localStorage.removeItem('sigab_user');
  window.location.replace('/admin/login.html');
}

// ── Fetch helper dengan JWT otomatis ─────────────────────
async function apiFetch(url, options = {}) {
  const token = getToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      ...(options.headers || {}),
    },
  });
  if (res.status === 401) { redirectLogin(); return null; }
  return res;
}

// ── Render info user di navbar admin ─────────────────────
function renderUserInfo() {
  const user = getUser();
  const nameEl = document.getElementById('admin-name');
  const roleEl = document.getElementById('admin-role');
  if (nameEl) nameEl.textContent = user.nama_lengkap || user.username || '—';
  if (roleEl) roleEl.textContent = user.role === 'admin' ? '🔑 Admin' : '✏ Editor';

  // Sembunyikan elemen khusus admin jika role editor
  if (user.role !== 'admin') {
    document.querySelectorAll('[data-admin-only]').forEach(el => el.remove());
  }
}

// ── Toast notification ────────────────────────────────────
function showToast(msg, type = 'success', duration = 3000) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.style.cssText = `
      position:fixed; top:72px; right:20px; z-index:9999;
      display:flex; flex-direction:column; gap:8px;
    `;
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  const colors = {
    success: { bg:'#f0fdf4', border:'#bbf7d0', color:'#166534', icon:'✅' },
    error:   { bg:'#fef2f2', border:'#fecaca', color:'#dc2626', icon:'❌' },
    info:    { bg:'#eff6ff', border:'#bfdbfe', color:'#1d4ed8', icon:'ℹ' },
    warning: { bg:'#fffbeb', border:'#fde68a', color:'#92400e', icon:'⚠' },
  };
  const c = colors[type] || colors.info;
  toast.style.cssText = `
    background:${c.bg}; border:1px solid ${c.border}; color:${c.color};
    padding:10px 16px; border-radius:10px; font-size:13px; font-weight:500;
    box-shadow:0 4px 12px rgba(0,0,0,0.1); display:flex; align-items:center; gap:8px;
    max-width:320px; animation: toastIn .25s ease;
    font-family:'Plus Jakarta Sans',sans-serif;
  `;
  toast.innerHTML = `${c.icon} <span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity .3s'; setTimeout(() => toast.remove(), 300); }, duration);
}

// ── Konfirmasi hapus ──────────────────────────────────────
function confirmDelete(msg = 'Yakin ingin menghapus data ini? Tindakan tidak dapat dibatalkan.') {
  return confirm(msg);
}

// ── Format angka ──────────────────────────────────────────
function fmtNum(n)   { return Number(n || 0).toLocaleString('id-ID'); }
function fmtRp(n)    { return 'Rp ' + fmtNum(n); }
function fmtDate(d)  {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
}

// ── Highlight nav aktif di sidebar ───────────────────────
function setActiveNav() {
  const path = window.location.pathname;
  document.querySelectorAll('.sidebar-link').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (path.endsWith(href) || (href !== '/' && path.includes(href.replace('.html','')))) {
      link.classList.add('active');
    }
  });
}

// ── CSS animasi toast (inject sekali) ────────────────────
(function injectToastCSS() {
  if (document.getElementById('toast-style')) return;
  const s = document.createElement('style');
  s.id = 'toast-style';
  s.textContent = `@keyframes toastIn { from{opacity:0;transform:translateX(20px)} to{opacity:1;transform:translateX(0)} }`;
  document.head.appendChild(s);
})();
