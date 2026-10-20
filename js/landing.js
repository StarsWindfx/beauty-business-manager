/* Page de vente : un seul moment animé au chargement (le reste se compte, la barre se laque),
   et le choix du vernis, qui relaque la page et sera retrouvé dans l'application. */
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Le chiffre du mois ---- */
  const bar = document.getElementById('demo-bar');
  const value = document.getElementById('demo-value');
  if (bar && value) {
    const ca = 2150, dep = 409.6, cot = 455.8, reste = ca - dep - cot;
    const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
    const segs = bar.querySelectorAll('span');
    const widths = [dep, cot, reste].map((v) => (v / ca) * 100);
    const paint = () => segs.forEach((s, i) => { s.style.width = widths[i] + '%'; });
    if (reduced) { paint(); value.textContent = fmt(reste); }
    else {
      const start = () => {
        paint();
        const t0 = performance.now(), dur = 1300;
        const ease = (t) => 1 - Math.pow(1 - t, 3);
        requestAnimationFrame(function step(now) {
          const k = ease(Math.min(1, (now - t0) / dur));
          value.textContent = fmt(reste * k);
          if (k < 1) requestAnimationFrame(step); else value.textContent = fmt(reste);
        });
      };
      setTimeout(start, 900);
    }
  }

  /* ---- Les flacons ---- */
  const THEMES = ['laque', 'rose', 'champagne', 'nude', 'prune'];
  const bottles = Array.from(document.querySelectorAll('.bottle'));
  const root = document.documentElement;
  /* Une teinte personnalisée (réglée dans l'application) est respectée : aucun flacon n'est alors marqué. */
  const custom = () => Boolean(root.style.getPropertyValue('--laque'));
  const mark = () => bottles.forEach((b) => b.classList.toggle('active', !custom() && b.dataset.theme === (THEMES.includes(root.dataset.theme) ? root.dataset.theme : 'laque')));
  if (!THEMES.includes(root.dataset.theme)) root.dataset.theme = 'laque';
  mark();
  bottles.forEach((b) => b.addEventListener('click', () => {
    const theme = b.dataset.theme;
    BBM.applyTheme({ theme, accent_color: null });
    mark();
    try { /* l'application s'ouvrira avec ce vernis */
      const d = JSON.parse(localStorage.getItem('bbm_data_v1') || 'null');
      if (d && d.settings) { d.settings.theme = theme; d.settings.accent_color = null; localStorage.setItem('bbm_data_v1', JSON.stringify(d)); }
    } catch { /* ignore */ }
  }));
})();
