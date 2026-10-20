/* Une seule animation, au chargement : la barre se laque et le reste se compte. */
(() => {
  const bar = document.getElementById('demo-bar');
  const value = document.getElementById('demo-value');
  if (!bar || !value) return;
  const ca = 2150, dep = 409.6, cot = 455.8, reste = ca - dep - cot;
  const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(n);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const segs = bar.querySelectorAll('span');
  const widths = [dep, cot, reste].map((v) => (v / ca) * 100);
  if (reduced) { segs.forEach((s, i) => { s.style.width = widths[i] + '%'; }); value.textContent = fmt(reste); return; }
  const t0 = performance.now();
  const dur = 1100;
  const ease = (t) => 1 - Math.pow(1 - t, 3);
  requestAnimationFrame(function step(now) {
    const k = ease(Math.min(1, (now - t0) / dur));
    value.textContent = fmt(reste * k);
    if (k < 1) requestAnimationFrame(step); else value.textContent = fmt(reste);
  });
  requestAnimationFrame(() => segs.forEach((s, i) => { s.style.width = widths[i] + '%'; }));
})();
