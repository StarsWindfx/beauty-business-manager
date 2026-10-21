/* Helpers partagés : appels API, formatage, thème, toasts. */
window.BBM = (() => {
  const api = async (path, { method = 'GET', body } = {}) => {
    const res = await fetch('/api' + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data = null;
    try { data = await res.json(); } catch { /* vide */ }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Erreur ${res.status}`);
      err.status = res.status; err.field = data && data.field; err.code = data && data.code;
      throw err;
    }
    return data;
  };

  const fmtMoney = (n, currency = 'EUR') => new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(Number(n) || 0);
  const fmtDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const fmtMonth = (ym) => { const [y, m] = ym.split('-'); return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'short', timeZone: 'UTC' }); };
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function applyTheme(settings) {
    const root = document.documentElement;
    root.dataset.theme = (settings && settings.theme) || 'bordeaux';
    if (settings && settings.accent_color) {
      root.style.setProperty('--laque', settings.accent_color);
      root.style.setProperty('--laque-2', lighten(settings.accent_color, 0.35));
      root.style.setProperty('--laque-text', contrastText(settings.accent_color));
    } else {
      root.style.removeProperty('--laque'); root.style.removeProperty('--laque-2'); root.style.removeProperty('--laque-text');
    }
    try { localStorage.setItem('bbm_theme', JSON.stringify({ theme: root.dataset.theme, accent_color: settings && settings.accent_color })); } catch { /* ignore */ }
  }
  function lighten(hex, amt) {
    const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.round(c + (255 - c) * amt).toString(16).padStart(2, '0');
    return `#${f(r)}${f(g)}${f(b)}`;
  }
  function contrastText(hex) {
    const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#1a1308' : '#ffffff';
  }
  // Applique immédiatement le thème mémorisé pour éviter un flash
  try { const t = JSON.parse(localStorage.getItem('bbm_theme') || 'null'); if (t) applyTheme(t); } catch { /* ignore */ }

  /* Mode jour / nuit : 'jour', 'nuit' ou 'auto' (suit le réglage de l'appareil). Mémorisé sur l'appareil. */
  const MODES = ['nuit', 'jour', 'auto'];
  const mediaLight = window.matchMedia('(prefers-color-scheme: light)');
  const getMode = () => { try { const m = localStorage.getItem('bbm_mode'); return MODES.includes(m) ? m : 'nuit'; } catch { return 'nuit'; } };
  function applyMode(mode) {
    if (!MODES.includes(mode)) mode = 'nuit';
    const resolved = mode === 'auto' ? (mediaLight.matches ? 'jour' : 'nuit') : mode;
    document.documentElement.dataset.mode = resolved;
    try { localStorage.setItem('bbm_mode', mode); } catch { /* ignore */ }
    const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', resolved === 'jour' ? '#f4ebe3' : '#1a0a0f');
    document.querySelectorAll('[data-mode-toggle]').forEach((b) => { b.setAttribute('aria-label', resolved === 'jour' ? 'Passer en mode nuit' : 'Passer en mode jour'); b.title = b.getAttribute('aria-label'); });
    document.querySelectorAll('[data-mode-pick]').forEach((b) => b.classList.toggle('active', b.dataset.modePick === mode));
  }
  const toggleMode = () => applyMode(document.documentElement.dataset.mode === 'jour' ? 'nuit' : 'jour');
  mediaLight.addEventListener('change', () => { if (getMode() === 'auto') applyMode('auto'); });
  applyMode(getMode());
  document.addEventListener('click', (e) => { const t = e.target.closest('[data-mode-toggle]'); if (t) toggleMode(); const p = e.target.closest('[data-mode-pick]'); if (p) applyMode(p.dataset.modePick); });

  let toastTimer;
  function toast(msg) {
    let el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg; el.style.display = 'block';
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.style.display = 'none'; }, 2600);
  }

  const qs = (sel, root = document) => root.querySelector(sel);
  const formData = (form) => Object.fromEntries(new FormData(form).entries());

  return { api, fmtMoney, fmtDate, fmtMonth, today, esc, applyTheme, toast, qs, formData, applyMode, getMode, toggleMode };
})();
