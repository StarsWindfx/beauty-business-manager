/* Un petit générateur de PDF, sans bibliothèque : A4, Helvetica, tableaux et filets.
   Sert aux archives mensuelles et aux rapports. Les accents passent par l'encodage WinAnsi. */
window.BBM = window.BBM || {};
BBM.pdf = (() => {
  const W = 595.28, H = 841.89, M = 48;
  /* Largeurs Helvetica (sur 1000) pour les caractères 32–126 ; 556 par défaut */
  const WIDTHS = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
  const SPECIAL = { '€': 0x80, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, 'œ': 0x9c, 'Œ': 0x8c, ' ': 0x20, ' ': 0x20, '−': 0x2d };
  const textWidth = (s, size, bold) => { const t = bold ? BOLD : WIDTHS; let w = 0; for (const ch of String(s)) { const c = ch.charCodeAt(0); w += (c >= 32 && c <= 126) ? t[c - 32] : 556; } return (w / 1000) * size; };
  const enc = (s) => { let out = ''; for (const ch of String(s)) { const c = ch.charCodeAt(0); let b = c; if (SPECIAL[ch] !== undefined) b = SPECIAL[ch]; else if (c > 255) b = 63; if (b === 40 || b === 41 || b === 92) out += '\\' + String.fromCharCode(b); else if (b < 32) out += ' '; else out += String.fromCharCode(b); } return out; };
  const hexToRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => v.toFixed(3)).join(' '); };

  class Doc {
    constructor() { this.pages = []; this.newPage(); }
    newPage() { this.ops = []; this.pages.push(this.ops); this.y = H - M; }
    ensure(h) { if (this.y - h < M) this.newPage(); }
    text(x, y, s, { size = 10, bold = false, color = '#1a0a0f', align = 'left', maxWidth } = {}) {
      let str = String(s);
      if (maxWidth) { while (str.length > 1 && textWidth(str, size, bold) > maxWidth) str = str.slice(0, -2) + '…'; }
      const w = textWidth(str, size, bold);
      const xx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
      this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${hexToRgb(color)} rg ${xx.toFixed(2)} ${y.toFixed(2)} Td (${enc(str)}) Tj ET`);
    }
    rect(x, y, w, h, color) { this.ops.push(`${hexToRgb(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); }
    line(x1, y1, x2, y2, color = '#d9c6bd', width = .6) { this.ops.push(`${hexToRgb(color)} RG ${width} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`); }
    /* Un tableau : colonnes [{label, width, align}], lignes [[cell,...]] ; cell = string | {text, bold, color} */
    table(cols, rows, { head = '#8a1f3a', headText = '#ffffff', zebra = '#f6ede6', rowH = 18 } = {}) {
      const x0 = M, totalW = W - 2 * M;
      const drawHead = () => {
        this.ensure(rowH + 4);
        this.rect(x0, this.y - rowH, totalW, rowH, head);
        let x = x0;
        for (const c of cols) { this.text(c.align === 'right' ? x + c.width - 8 : x + 8, this.y - rowH + 5.5, c.label, { size: 9, bold: true, color: headText, align: c.align === 'right' ? 'right' : 'left' }); x += c.width; }
        this.y -= rowH;
      };
      drawHead();
      rows.forEach((r, i) => {
        if (this.y - rowH < M) { this.newPage(); drawHead(); }
        if (i % 2 === 1) this.rect(x0, this.y - rowH, totalW, rowH, zebra);
        let x = x0;
        r.forEach((cell, j) => {
          const c = cols[j]; const o = typeof cell === 'object' && cell ? cell : { text: cell };
          this.text(c.align === 'right' ? x + c.width - 8 : x + 8, this.y - rowH + 5.5, o.text ?? '', { size: 9.5, bold: Boolean(o.bold), color: o.color || '#1a0a0f', align: c.align === 'right' ? 'right' : 'left', maxWidth: c.width - 16 });
          x += c.width;
        });
        this.line(x0, this.y - rowH, x0 + totalW, this.y - rowH);
        this.y -= rowH;
      });
    }
    build() {
      const objs = [];
      const add = (s) => { objs.push(s); return objs.length; };
      add('<< /Type /Catalog /Pages 2 0 R >>');
      add(''); // pages, rempli après
      const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
      const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
      const kids = [];
      for (const ops of this.pages) {
        const content = ops.join('\n');
        const c = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
        const p = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Contents ${c} 0 R /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> >>`);
        kids.push(`${p} 0 R`);
      }
      objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
      let out = '%PDF-1.4\n%âãÏÓ\n'; const offsets = [];
      objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
      const xref = out.length;
      out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
      const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
      return new Blob([bytes], { type: 'application/pdf' });
    }
  }

  const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
  const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

  /* Le relevé d'un mois : revenus et dépenses dans un seul tableau, la différence en bas */
  function monthStatement({ title, subtitle, business, rows, revenue, expenses }) {
    const doc = new Doc();
    doc.text(M, doc.y - 14, business || 'The Beauty Business Manager', { size: 9, color: '#8a6a66' });
    doc.text(M, doc.y - 40, title, { size: 20, bold: true });
    if (subtitle) doc.text(M, doc.y - 56, subtitle, { size: 10, color: '#8a6a66' });
    doc.y -= 74;
    const cols = [{ label: 'Date', width: 90 }, { label: 'Type', width: 279 }, { label: 'Montant', width: 130, align: 'right' }];
    doc.table(cols, rows.map((r) => [fmtDate(r.date), r.label, { text: (r.type === 'income' ? '+ ' : '− ') + fmt(r.amount), bold: true, color: r.type === 'income' ? '#7a5c18' : '#8a1f3a' }]));
    doc.ensure(70);
    doc.y -= 10;
    doc.line(M, doc.y, W - M, doc.y, '#8a1f3a', 1);
    doc.y -= 20;
    doc.text(M, doc.y, 'Revenus', { size: 10, color: '#8a6a66' }); doc.text(W - M, doc.y, fmt(revenue), { size: 11, bold: true, align: 'right', color: '#7a5c18' });
    doc.y -= 16;
    doc.text(M, doc.y, 'Dépenses', { size: 10, color: '#8a6a66' }); doc.text(W - M, doc.y, fmt(expenses), { size: 11, bold: true, align: 'right', color: '#8a1f3a' });
    doc.y -= 20;
    doc.text(M, doc.y, 'Différence', { size: 12, bold: true }); doc.text(W - M, doc.y, fmt(revenue - expenses), { size: 14, bold: true, align: 'right' });
    doc.y -= 30;
    doc.text(M, M - 14, 'Relevé de suivi, à titre indicatif. Ne constitue pas un document comptable.', { size: 7.5, color: '#8a6a66' });
    return doc.build();
  }

  /* Un rapport de période : chiffres clés, revenus par type, clientes, puis le relevé */
  function report({ title, subtitle, business, kpis, byType, clients, rows, revenue, expenses }) {
    const doc = new Doc();
    doc.text(M, doc.y - 14, business || 'The Beauty Business Manager', { size: 9, color: '#8a6a66' });
    doc.text(M, doc.y - 40, title, { size: 20, bold: true });
    if (subtitle) doc.text(M, doc.y - 56, subtitle, { size: 10, color: '#8a6a66' });
    doc.y -= 80;
    const bw = (W - 2 * M - 3 * 10) / 4;
    kpis.slice(0, 4).forEach((k, i) => { const x = M + i * (bw + 10); doc.rect(x, doc.y - 54, bw, 54, '#f6ede6'); doc.text(x + 10, doc.y - 18, k.label, { size: 8.5, color: '#8a6a66' }); doc.text(x + 10, doc.y - 40, k.value, { size: 14, bold: true }); });
    doc.y -= 74;
    if (byType.length) {
      doc.text(M, doc.y, 'Revenus par type', { size: 12, bold: true }); doc.y -= 10;
      doc.table([{ label: 'Type', width: 329 }, { label: 'Part', width: 70, align: 'right' }, { label: 'Montant', width: 100, align: 'right' }], byType.map((t) => [t.label, `${t.pct} %`, { text: fmt(t.amount), bold: true }]));
      doc.y -= 18;
    }
    if (clients && clients.length) {
      doc.ensure(60);
      doc.text(M, doc.y, 'Meilleures clientes', { size: 12, bold: true }); doc.y -= 10;
      doc.table([{ label: 'Cliente', width: 259 }, { label: 'Visites', width: 70, align: 'right' }, { label: 'Total', width: 170, align: 'right' }], clients.map((c) => [c.display, String(c.visits), { text: fmt(c.total), bold: true }]));
      doc.y -= 18;
    }
    doc.ensure(60);
    doc.text(M, doc.y, 'Relevé des opérations', { size: 12, bold: true }); doc.y -= 10;
    doc.table([{ label: 'Date', width: 90 }, { label: 'Type', width: 279 }, { label: 'Montant', width: 130, align: 'right' }], rows.map((r) => [fmtDate(r.date), r.label, { text: (r.type === 'income' ? '+ ' : '− ') + fmt(r.amount), bold: true, color: r.type === 'income' ? '#7a5c18' : '#8a1f3a' }]));
    doc.ensure(50); doc.y -= 14;
    doc.line(M, doc.y, W - M, doc.y, '#8a1f3a', 1); doc.y -= 20;
    doc.text(M, doc.y, 'Différence', { size: 12, bold: true }); doc.text(W - M, doc.y, fmt(revenue - expenses), { size: 14, bold: true, align: 'right' });
    doc.text(M, M - 14, 'Rapport de suivi, à titre indicatif. Ne constitue pas un document comptable.', { size: 7.5, color: '#8a6a66' });
    return doc.build();
  }

  return { monthStatement, report, Doc };
})();
