/* Graphiques en SVG, sans bibliothèque : courbes, barres, barres horizontales, anneau, calendrier de chaleur,
   étincelles. Chaque fonction renvoie du SVG ; `attach` branche le survol / le toucher. */
window.BBM = window.BBM || {};
BBM.charts = (() => {
  const niceMax = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const f = v / p; const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10; return n * p; };
  const fmtK = (v) => Math.abs(v) >= 1000 ? (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k' : String(Math.round(v));
  const fmtMoney = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(n) || 0);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PALETTE = ['var(--or)', 'var(--laque)', 'var(--nacre-2)', 'color-mix(in srgb, var(--laque) 50%, var(--or))', 'var(--sourdine)'];

  /* Une infobulle : une pastille avec une ou plusieurs lignes, calée dans la largeur */
  function tip(x, y, lines, W) {
    const w = Math.max(...lines.map((l) => l.length)) * 6.3 + 18, h = 14 * lines.length + 8;
    const tx = Math.min(W - w - 2, Math.max(2, x - w / 2)), ty = Math.max(2, y - h - 10);
    return `<g class="tipg"><rect class="tip-bg" x="${tx}" y="${ty}" width="${w}" height="${h}" rx="8"/>${lines.map((l, i) => `<text class="tip-t" x="${tx + w / 2}" y="${ty + 13 + i * 14}" text-anchor="middle">${esc(l)}</text>`).join('')}</g>`;
  }
  const labelStep = (n, W) => Math.max(1, Math.ceil(n / Math.max(3, Math.floor(W / 40))));

  /* Courbes : plusieurs séries sur les mêmes abscisses */
  function lineChart({ W, H = 230, series, labels, selected = null, fmtV = fmtMoney, fmtAxis = fmtK, zeroBase = true, id = 'lc', tipLines = null }) {
    const padL = 44, padR = 10, padT = 24, padB = 26, n = labels.length;
    const all = series.flatMap((s) => s.values);
    const max = niceMax(Math.max(1, ...all)), min = zeroBase ? 0 : Math.min(0, ...all);
    const innerW = W - padL - padR, innerH = H - padT - padB;
    const x = (i) => padL + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
    const y = (v) => padT + innerH * (1 - (v - min) / (max - min));
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" data-n="${n}" data-padl="${padL}" data-innerw="${innerW}" data-kind="line"><defs>${series.map((sr, i) => `<linearGradient id="${id}-a${i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:${sr.color};stop-opacity:.35"/><stop offset="1" style="stop-color:${sr.color};stop-opacity:0"/></linearGradient>`).join('')}</defs>`;
    [0, .25, .5, .75, 1].forEach((f) => { const v = min + (max - min) * f; s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${esc(fmtAxis(v))}</text>`; });
    series.forEach((sr, si) => {
      const pts = sr.values.map((v, i) => [x(i), y(v)]);
      const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
      if (sr.area && n > 1) s += `<path d="${d} L${pts[n - 1][0]} ${y(min)} L${pts[0][0]} ${y(min)} Z" fill="url(#${id}-a${si})"/>`;
      s += `<path d="${d}" fill="none" stroke="${sr.color}" stroke-width="${sr.width || 2.4}" stroke-linejoin="round" stroke-linecap="round" ${sr.dash ? 'stroke-dasharray="5 5"' : ''}/>`;
      if (n <= 16) pts.forEach((p, i) => { s += `<circle cx="${p[0]}" cy="${p[1]}" r="${selected === i ? 5 : 3}" fill="${sr.color}" stroke="var(--velours)" stroke-width="1.5"/>`; });
    });
    const step = labelStep(n, W);
    labels.forEach((l, i) => { if (i % step === 0 || i === n - 1) s += `<text x="${x(i)}" y="${H - 7}" text-anchor="middle" class="${selected === i ? 'now' : ''}">${esc(l)}</text>`; });
    if (selected !== null && selected >= 0 && selected < n) {
      s += `<line x1="${x(selected)}" x2="${x(selected)}" y1="${padT}" y2="${y(min)}" stroke="var(--nacre)" stroke-opacity=".35" stroke-dasharray="3 4"/>`;
      s += tip(x(selected), Math.min(...series.map((sr) => y(sr.values[selected]))), [labels[selected], ...series.map((sr) => `${sr.name} ${fmtV(sr.values[selected])}`), ...(tipLines ? tipLines(selected) : [])], W);
    }
    return s + '</svg>';
  }

  /* Barres groupées ou empilées */
  function barChart({ W, H = 220, labels, series, stacked = false, selected = null, highlight = null, fmtV = fmtMoney, fmtAxis = fmtK, refLine = null, tipLines = null }) {
    const padL = 44, padR = 10, padT = 24, padB = 26, n = labels.length;
    const totals = labels.map((_, i) => stacked ? series.reduce((s, sr) => s + sr.values[i], 0) : Math.max(...series.map((sr) => sr.values[i])));
    const max = niceMax(Math.max(1, ...totals, refLine || 0));
    const innerW = W - padL - padR, innerH = H - padT - padB, slot = innerW / n;
    const y = (v) => padT + innerH * (1 - v / max);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" data-n="${n}" data-padl="${padL}" data-innerw="${innerW}" data-kind="bar">`;
    [0, .5, 1].forEach((f) => { s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y(max * f)}" y2="${y(max * f)}"/><text x="${padL - 6}" y="${y(max * f) + 4}" text-anchor="end">${esc(fmtAxis(max * f))}</text>`; });
    const gw = Math.max(6, Math.min(30, slot * (stacked ? .55 : .7 / series.length)));
    labels.forEach((l, i) => {
      const cx = padL + slot * i + slot / 2;
      if (stacked) {
        let acc = 0;
        series.forEach((sr) => { const v = sr.values[i]; if (v > 0) { s += `<rect x="${cx - gw / 2}" y="${y(acc + v)}" width="${gw}" height="${Math.max(0, y(acc) - y(acc + v))}" fill="${sr.color}" rx="2" opacity="${highlight === i ? 1 : .88}"/>`; acc += v; } });
      } else {
        const total = series.length * gw + (series.length - 1) * 2;
        series.forEach((sr, si) => { const v = sr.values[i]; const bx = cx - total / 2 + si * (gw + 2); s += `<rect x="${bx}" y="${y(v)}" width="${gw}" height="${Math.max(0, y(0) - y(v))}" fill="${sr.color}" rx="3" opacity="${highlight === i ? 1 : .88}"/>`; });
      }
      s += `<rect class="hit" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${innerH}" fill="transparent"/>`;
    });
    if (refLine !== null) s += `<line x1="${padL}" x2="${W - padR}" y1="${y(refLine)}" y2="${y(refLine)}" stroke="var(--or-2)" stroke-dasharray="4 4" stroke-width="1.2"/>`;
    const step = labelStep(n, W);
    labels.forEach((l, i) => { if (i % step === 0 || i === n - 1) s += `<text x="${padL + slot * i + slot / 2}" y="${H - 7}" text-anchor="middle" class="${highlight === i ? 'now' : ''}">${esc(l)}</text>`; });
    if (selected !== null && selected >= 0 && selected < n) s += tip(padL + slot * selected + slot / 2, y(totals[selected]), [labels[selected], ...series.map((sr) => `${sr.name} ${fmtV(sr.values[selected])}`), ...(tipLines ? tipLines(selected) : [])], W);
    return s + '</svg>';
  }

  /* Barres horizontales : classements */
  function hbars({ W, items, fmtV = fmtMoney, color = 'var(--or)', rowH = 30 }) {
    const valLen = Math.max(...items.map((it) => (fmtV(it.value) + (it.extra ? ' ' + it.extra : '')).length));
    const padL = Math.min(150, Math.max(70, W * .36)), padR = Math.min(W * .4, Math.max(54, valLen * 6.6 + 10)), H = items.length * rowH + 6;
    const max = Math.max(1, ...items.map((it) => it.value));
    const innerW = W - padL - padR;
    let s = `<svg class="chart hb" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
    items.forEach((it, i) => {
      const yy = 4 + i * rowH; const w = Math.max(2, (it.value / max) * innerW);
      s += `<text x="${padL - 10}" y="${yy + rowH / 2 + 4}" text-anchor="end" class="lbl">${esc(it.label.length > 22 ? it.label.slice(0, 21) + '…' : it.label)}</text>`;
      s += `<rect x="${padL}" y="${yy + 7}" width="${innerW}" height="${rowH - 14}" rx="7" class="track"/>`;
      s += `<rect x="${padL}" y="${yy + 7}" width="${w}" height="${rowH - 14}" rx="7" fill="${it.color || color}"/>`;
      s += `<text x="${padL + innerW + 8}" y="${yy + rowH / 2 + 4}" class="val">${esc(fmtV(it.value))}${it.extra ? ` <tspan class="muted">${esc(it.extra)}</tspan>` : ''}</text>`;
    });
    return s + '</svg>';
  }

  /* Anneau */
  function donut({ groups, total, colors = PALETTE, center, sub }) {
    const r = 52, c = 2 * Math.PI * r; let off = 0;
    const arcs = groups.map((g, i) => { const len = total > 0 ? c * g.amount / total : 0; const el = `<circle class="arc" cx="70" cy="70" r="${r}" style="stroke:${colors[i % colors.length]}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += len; return el; }).join('');
    return `<svg class="donut" viewBox="0 0 140 140"><circle class="track" cx="70" cy="70" r="${r}"/>${arcs}<text class="center" x="70" y="67">${esc(center)}</text><text class="center-k" x="70" y="83">${esc(sub)}</text></svg>`;
  }

  /* Calendrier de chaleur : une case par jour, les semaines en colonnes */
  function heatmap({ W, days, weeks = 12, selected = null, fmtV = fmtMoney }) {
    const cell = Math.max(10, Math.min(30, Math.floor((W - 36) / weeks) - 3)), gap = 3, padL = 30, padT = 18;
    const H = padT + 7 * (cell + gap) + 8;
    const max = Math.max(1, ...days.map((d) => d.value));
    let s = `<svg class="chart heat" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`;
    ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach((d, i) => { s += `<text x="${padL - 8}" y="${padT + i * (cell + gap) + cell / 2 + 4}" text-anchor="end">${d}</text>`; });
    days.forEach((d, i) => {
      const col = Math.floor(i / 7), row = i % 7; const xx = padL + col * (cell + gap), yy = padT + row * (cell + gap);
      const t = d.value / max; const op = d.value > 0 ? .25 + .75 * Math.sqrt(t) : 0;
      if (row === 0 && d.monthStart) s += `<text x="${xx}" y="${padT - 6}">${esc(d.monthStart)}</text>`;
      s += `<rect data-i="${i}" x="${xx}" y="${yy}" width="${cell}" height="${cell}" rx="4" class="cell ${d.future ? 'future' : ''} ${selected === i ? 'sel' : ''}" style="fill:${d.value > 0 ? `color-mix(in srgb, var(--or) ${Math.round(op * 100)}%, var(--encre))` : 'var(--encre)'}"/>`;
    });
    if (selected !== null && days[selected]) { const col = Math.floor(selected / 7), row = selected % 7; s += tip(padL + col * (cell + gap) + cell / 2, padT + row * (cell + gap), [days[selected].label, days[selected].value > 0 ? `${fmtV(days[selected].value)} · ${days[selected].count} presta.` : 'Rien ce jour-là'], W); }
    return s + '</svg>';
  }

  /* Étincelle : une mini-courbe dans une tuile */
  function sparkline({ values, W = 96, H = 30, color = 'var(--or)' }) {
    const n = values.length; if (!n) return '';
    const max = Math.max(1, ...values), min = Math.min(0, ...values);
    const x = (i) => 2 + ((W - 4) * i) / Math.max(1, n - 1), y = (v) => 2 + (H - 4) * (1 - (v - min) / (max - min || 1));
    const d = values.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"><path d="${d} L${x(n - 1)} ${H} L${x(0)} ${H} Z" fill="${color}" opacity=".15"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x(n - 1)}" cy="${y(values[n - 1])}" r="2.6" fill="${color}"/></svg>`;
  }

  /* Survol à la souris, toucher sur mobile : renvoie l'index choisi */
  function attach(slot, onSelect) {
    const svg = slot.querySelector('svg'); if (!svg) return;
    const n = Number(svg.dataset.n), padL = Number(svg.dataset.padl), innerW = Number(svg.dataset.innerw);
    const idx = (e) => { const r = svg.getBoundingClientRect(); const scale = r.width / svg.viewBox.baseVal.width; const px = (e.clientX - r.left) / scale - padL; if (svg.dataset.kind === 'line') return Math.max(0, Math.min(n - 1, Math.round((px / innerW) * (n - 1)))); return Math.max(0, Math.min(n - 1, Math.floor((px / innerW) * n))); };
    svg.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') onSelect(idx(e)); });
    svg.addEventListener('click', (e) => onSelect(idx(e)));
  }
  function attachHeat(slot, onSelect) { const svg = slot.querySelector('svg'); if (!svg) return; svg.addEventListener('click', (e) => { const c = e.target.closest('[data-i]'); if (c) onSelect(Number(c.dataset.i)); }); }

  return { lineChart, barChart, hbars, donut, heatmap, sparkline, attach, attachHeat, PALETTE, niceMax };
})();
