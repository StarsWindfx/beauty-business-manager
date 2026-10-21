/* Application principale : routeur minimal + vues. */
(() => {
  const { api, fmtMoney, fmtDate, fmtMonth, today, esc, applyTheme, toast, qs } = BBM;
  const C = window.CALC;
  const view = qs('#view');
  const state = { user: null, settings: null, config: null };

  const TX_CAT = { prestation: 'Prestation', vente: 'Vente de produits', fournitures: 'Fournitures', materiel: 'Matériel', abonnement: 'Abonnement', loyer: 'Loyer, local', formation: 'Formation', marketing: 'Communication', transport: 'Déplacements', frais: 'Frais divers', autre: 'Autre' };
  const SUB_CAT = { logiciel: 'Logiciel', reservation: 'Prise de rendez-vous', reseaux: 'Réseaux sociaux', assurance: 'Assurance', banque: 'Banque', telephonie: 'Téléphone', formation: 'Formation', local: 'Local', autre: 'Autre' };
  const FREQ = { monthly: 'Chaque mois', quarterly: 'Chaque trimestre', yearly: 'Chaque année', weekly: 'Chaque semaine', custom: 'Tous les N mois' };
  const STATUS = { active: 'Actif', paused: 'En pause', canceled: 'Résilié' };
  const THEMES = { bordeaux: ['Bordeaux', '#8a1f3a'], rose: ['Rose poudré', '#c4717f'], laque: ['Rouge laque', '#b3123f'], champagne: ['Champagne', '#b38a4e'], nude: ['Nude', '#a27a64'], prune: ['Prune', '#6d3b8f'] };
  const TITLES = { '/app': 'Tableau de bord', '/app/operations': 'Revenus & dépenses', '/app/clients': 'Clients', '/app/objectifs': 'Objectifs', '/app/rapports': 'Rapports', '/app/statistiques': 'Statistiques', '/app/parametres': 'Réglages', '/app/abonnements': 'Abonnements' };
  const MONTHS_SHORT = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc'];
  const DAYS_SHORT = ['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim'];
  const options = (map, selected) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const ico = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const monthName = (d = new Date()) => d.toLocaleDateString('fr-FR', { month: 'long' });
  const deMonth = (d) => { const m = monthName(d); return (/^[aeiouy]/i.test(m) ? "d'" : 'de ') + m; };
  const pad = (n) => String(n).padStart(2, '0');
  const ymOf = (iso) => iso.slice(0, 7);
  const monthLabel = (ym) => { const [y, m] = ym.split('-'); return cap(new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })); };
  const monthBounds = (ym) => { const [y, m] = ym.split('-').map(Number); return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}` }; };
  const shiftMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
  const lastMonths = (n) => { const now = new Date(); const out = []; for (let i = n - 1; i >= 0; i--) { const x = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(`${x.getFullYear()}-${pad(x.getMonth() + 1)}`); } return out; };
  const isWide = () => window.matchMedia('(min-width: 600px)').matches;
  const dayLabel = (iso) => {
    const t = today(); if (iso === t) return "Aujourd'hui";
    const y = new Date(); y.setDate(y.getDate() - 1); if (iso === `${y.getFullYear()}-${pad(y.getMonth() + 1)}-${pad(y.getDate())}`) return 'Hier';
    const [yy, mm, dd] = iso.split('-'); const d = new Date(Date.UTC(yy, mm - 1, dd));
    return cap(d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' }));
  };
  const pctHtml = (cur, prev, ref) => { const p = C.pctChange(cur, prev); if (p === null) return `<div class="d">vs ${ref}</div>`; return `<div class="d ${p > 0 ? 'up' : p < 0 ? 'down' : ''}"><b>${p > 0 ? '+' : ''}${p} %</b> vs ${ref}</div>`; };

  /* ---------- Tiroirs ---------- */
  function modal(html, onSubmit) {
    const root = qs('#modal-root');
    root.innerHTML = `<div class="modal"><form class="sheet">${html}</form></div>`;
    const form = qs('form', root);
    const close = () => { root.innerHTML = ''; };
    qs('.modal', root).addEventListener('click', (e) => { if (e.target.classList.contains('modal')) close(); });
    form.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) { e.preventDefault(); close(); } });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = qs('[data-error]', form); if (err) err.textContent = '';
      const btn = qs('button[type=submit]', form); if (btn) btn.disabled = true;
      try { await onSubmit(Object.fromEntries(new FormData(form).entries()), form); close(); }
      catch (ex) { if (err) err.textContent = ex.message; else toast(ex.message); }
      finally { if (btn) btn.disabled = false; }
    });
    const first = qs('[autofocus], input:not([type=hidden]), select', form);
    if (first && isWide()) first.focus();
    return { form, close };
  }
  const confirmDialog = (title, text, label = 'Supprimer') => new Promise((resolve) => {
    modal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>
      <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-close>Annuler</button><button class="btn btn-danger" type="submit">${esc(label)}</button></div>`,
    async () => resolve(true));
    qs('.modal').addEventListener('click', (e) => { if (e.target.classList.contains('modal') || e.target.closest('[data-close]')) resolve(false); });
  });
  function moreSheet() {
    modal(`<h3>Plus</h3>
      <div class="menu-list">
        <a href="./app.html#objectifs">${ico('goal')}Objectifs</a>
        <a href="./app.html#rapports">${ico('report')}Rapports</a>
        <a href="./app.html#statistiques">${ico('stats')}Statistiques</a>
        <a href="./app.html#abonnements">${ico('subs')}Abonnements</a>
        <a href="./app.html#parametres">${ico('settings')}Réglages</a>
        <button type="button" id="more-export">${ico('export')}Exporter mes données<small>JSON</small></button>
        <a href="./support.html">${ico('help')}Support</a>
        <a href="./index.html">${ico('site')}Site</a>
      </div>`, async () => {});
    qs('#more-export').addEventListener('click', () => { BBM.local.download(`bbm-export-${today()}.json`, BBM.local.exportJson(), 'application/json'); toast('Export téléchargé'); });
  }

  /* ---------- Formulaire opération ---------- */
  async function txForm(tx = {}, onDone, preset = {}) {
    const isEdit = Boolean(tx.id);
    const type = tx.type || preset.type || 'income';
    const [all, clients] = await Promise.all([api('/transactions'), api('/clients')]);
    let chips = '';
    if (!isEdit) {
      const seen = new Set(); const recent = [];
      for (const t of all.items) { const k = t.type + '|' + t.label.toLowerCase(); if (seen.has(k)) continue; seen.add(k); recent.push(t); if (recent.length >= 8) break; }
      if (recent.length) chips = `<p class="chips-k">Saisie rapide</p><div class="chips">${recent.map((t) => `<button type="button" class="chip ${t.type === 'expense' ? 'out' : ''}" data-chip data-type="${t.type}" data-label="${esc(t.label)}" data-amount="${t.amount}" data-category="${t.category}">${esc(t.label)} <b>${fmtMoney(t.amount)}</b></button>`).join('')}</div>`;
    }
    const types = [...new Set(all.items.map((t) => t.label))].slice(0, 60);
    const clientId = tx.client_id || preset.client_id || '';
    const { form } = modal(`
      <h3>${isEdit ? 'Modifier l\'opération' : 'Nouvelle opération'}</h3>
      <div class="segmented" style="margin-bottom:14px">
        <button type="button" data-type="income" class="${type === 'income' ? 'active' : ''}">Revenu</button>
        <button type="button" data-type="expense" class="${type === 'expense' ? 'active' : ''}">Dépense</button>
      </div>
      ${chips}
      <input type="hidden" name="type" value="${type}">
      <div class="field amount-field"><label>Montant, €</label><input name="amount" type="number" step="0.01" min="0" inputmode="decimal" required value="${tx.amount ?? preset.amount ?? ''}" placeholder="45" autofocus></div>
      <div class="field"><label>Type</label><input name="label" list="type-list" required maxlength="120" value="${esc(tx.label || preset.label || '')}" placeholder="Pose gel, remplissage, fournitures…" enterkeyhint="done"><datalist id="type-list">${types.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></div>
      <div class="row">
        <div class="field"><label>Date</label><input name="date" type="date" required value="${tx.date || preset.date || today()}"></div>
        <div class="field"><label>Catégorie</label><select name="category">${options(TX_CAT, tx.category || (type === 'income' ? 'prestation' : 'fournitures'))}</select></div>
      </div>
      <div class="field" data-client-field ${type === 'income' ? '' : 'hidden'}><label>Cliente</label><select name="client_id"><option value="">Aucune</option>${clients.items.map((c) => `<option value="${c.id}" ${Number(clientId) === c.id ? 'selected' : ''}>${esc(c.display)}</option>`).join('')}</select></div>
      <div class="field"><label>Note</label><textarea name="note" rows="2" maxlength="1000">${esc(tx.note || '')}</textarea></div>
      <div class="error" data-error></div>
      <div class="actions" style="justify-content:${isEdit ? 'space-between' : 'flex-end'}">${isEdit ? '<button class="btn btn-danger" type="button" id="tx-del">Supprimer</button>' : ''}<span style="display:flex;gap:6px"><button class="btn btn-ghost" type="button" data-close>Annuler</button><button class="btn btn-primary" type="submit">${isEdit ? 'Enregistrer' : 'Ajouter'}</button></span></div>`,
    async (data) => {
      if (isEdit) await api(`/transactions/${tx.id}`, { method: 'PUT', body: data });
      else await api('/transactions', { method: 'POST', body: data });
      toast(isEdit ? 'Enregistré' : 'Ajouté');
      onDone && onDone();
    });
    const setType = (t) => {
      form.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('active', x.dataset.type === t));
      form.type.value = t;
      qs('[data-client-field]', form).hidden = t !== 'income';
      if (!isEdit) form.category.value = t === 'income' ? 'prestation' : 'fournitures';
    };
    form.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => setType(b.dataset.type)));
    form.querySelectorAll('[data-chip]').forEach((c) => c.addEventListener('click', () => {
      setType(c.dataset.type); form.label.value = c.dataset.label; form.amount.value = c.dataset.amount; form.category.value = c.dataset.category;
      qs('button[type=submit]', form).focus();
    }));
    const del = qs('#tx-del', form);
    if (del) del.addEventListener('click', async () => { qs('#modal-root').innerHTML = ''; if (await confirmDialog('Supprimer cette opération ?', `${tx.label}, ${fmtMoney(tx.amount)}. Les totaux seront recalculés.`)) { await api(`/transactions/${tx.id}`, { method: 'DELETE' }); toast('Supprimé'); onDone && onDone(); } });
  }

  /* ---------- Formulaire cliente ---------- */
  function clientForm(c = {}, onDone) {
    const isEdit = Boolean(c.id);
    modal(`
      <h3>${isEdit ? 'Modifier la fiche' : 'Nouvelle cliente'}</h3>
      <div class="row"><div class="field"><label>Prénom</label><input name="first_name" required maxlength="80" value="${esc(c.first_name || '')}" autofocus autocomplete="off"></div><div class="field"><label>Nom</label><input name="last_name" maxlength="80" value="${esc(c.last_name || '')}" autocomplete="off"></div></div>
      <div class="row"><div class="field"><label>Téléphone</label><input name="phone" type="tel" inputmode="tel" maxlength="40" value="${esc(c.phone || '')}"></div><div class="field"><label>E-mail</label><input name="email" type="email" inputmode="email" maxlength="120" value="${esc(c.email || '')}"></div></div>
      <div class="field"><label>Note</label><textarea name="note" rows="3" maxlength="2000" placeholder="Préférences, allergies, couleur habituelle…">${esc(c.note || '')}</textarea></div>
      <div class="error" data-error></div>
      <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-close>Annuler</button><button class="btn btn-primary" type="submit">${isEdit ? 'Enregistrer' : 'Ajouter'}</button></div>`,
    async (data) => {
      const r = isEdit ? await api(`/clients/${c.id}`, { method: 'PUT', body: data }) : await api('/clients', { method: 'POST', body: data });
      toast(isEdit ? 'Fiche enregistrée' : 'Cliente ajoutée');
      onDone && onDone(r);
    });
  }

  /* ---------- Formulaire abonnement ---------- */
  function subForm(sub = {}, onDone) {
    const isEdit = Boolean(sub.id);
    const { form } = modal(`
      <h3>${isEdit ? 'Modifier l\'abonnement' : 'Nouvel abonnement'}</h3>
      <div class="field"><label>Nom</label><input name="name" required maxlength="120" value="${esc(sub.name || '')}" placeholder="Planity, Canva, assurance…"></div>
      <div class="row">
        <div class="field"><label>Montant, €</label><input name="amount" type="number" step="0.01" min="0" inputmode="decimal" required value="${sub.amount ?? ''}"></div>
        <div class="field"><label>Fréquence</label><select name="frequency">${options(FREQ, sub.frequency || 'monthly')}</select></div>
      </div>
      <div class="field ${(sub.frequency || 'monthly') === 'custom' ? '' : 'hidden'}" data-custom><label>Tous les … mois</label><input name="custom_months" type="number" min="1" max="60" step="1" value="${sub.custom_months ?? 2}"></div>
      <div class="row">
        <div class="field"><label>Prochain prélèvement</label><input name="next_charge_date" type="date" required value="${sub.next_charge_date || today()}"></div>
        <div class="field"><label>Statut</label><select name="status">${options(STATUS, sub.status || 'active')}</select></div>
      </div>
      <div class="field"><label>Catégorie</label><select name="category">${options(SUB_CAT, sub.category || 'logiciel')}</select></div>
      <div class="field"><label>Note</label><textarea name="note" rows="2" maxlength="1000">${esc(sub.note || '')}</textarea></div>
      <div class="error" data-error></div>
      <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-close>Annuler</button><button class="btn btn-primary" type="submit">${isEdit ? 'Enregistrer' : 'Ajouter'}</button></div>`,
    async (data) => {
      if (isEdit) await api(`/subscriptions/${sub.id}`, { method: 'PUT', body: data });
      else await api('/subscriptions', { method: 'POST', body: data });
      toast(isEdit ? 'Enregistré' : 'Ajouté');
      onDone && onDone();
    });
    form.frequency.addEventListener('change', () => qs('[data-custom]', form).classList.toggle('hidden', form.frequency.value !== 'custom'));
  }

  /* ---------- Graphiques ---------- */
  const niceMax = (v) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v)))); const f = v / p; const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10; return n * p; };
  const fmtK = (v) => v >= 1000 ? (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k' : String(Math.round(v));
  /* Barres du chiffre d'affaires : la barre en cours est plus claire, on touche une barre pour lire sa valeur */
  function revChart(items, labels, currentKey, selectedKey, W) {
    const H = 210, padL = 40, padR = 8, padT = 34, padB = 26;
    const max = niceMax(Math.max(1, ...items.map((d) => d.revenue)));
    const innerW = W - padL - padR, slot = innerW / items.length, bw = Math.max(8, Math.min(34, slot * .56));
    const y = (v) => padT + (H - padT - padB) * (1 - v / max);
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Chiffre d'affaires"><defs>
      <linearGradient id="g-or" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--or)"/><stop offset="1" style="stop-color:var(--or-deep)"/></linearGradient>
      <linearGradient id="g-or-now" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:color-mix(in srgb, var(--or-2) 70%, white)"/><stop offset="1" style="stop-color:var(--or)"/></linearGradient></defs>`;
    [0, .5, 1].forEach((f) => { s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y(max * f)}" y2="${y(max * f)}"/><text x="${padL - 6}" y="${y(max * f) + 4}" text-anchor="end">${fmtK(max * f)}</text>`; });
    items.forEach((d, i) => {
      const cx = padL + slot * i + slot / 2;
      const h = Math.max(0, y(0) - y(d.revenue));
      s += `<rect class="bar-r ${d.key === currentKey ? 'now' : ''} ${d.key === selectedKey ? 'sel' : ''}" data-key="${d.key}" x="${cx - bw / 2}" y="${y(d.revenue)}" width="${bw}" height="${h}" rx="4"/>`;
      s += `<rect class="hit" data-key="${d.key}" x="${padL + slot * i}" y="${padT}" width="${slot}" height="${H - padT - padB}" fill="transparent"/>`;
      s += `<text x="${cx}" y="${H - 7}" text-anchor="middle" class="${d.key === currentKey ? 'now' : ''}">${labels[i]}</text>`;
      if (d.key === selectedKey) {
        const label = fmtMoney(d.revenue) + (d.count ? ` · ${d.count} presta.` : ''); const tw = label.length * 6.4 + 16; const tx = Math.min(W - padR - tw, Math.max(padL, cx - tw / 2)); const ty = Math.max(2, y(d.revenue) - 26);
        s += `<rect class="tip-bg" x="${tx}" y="${ty}" width="${tw}" height="20" rx="10"/><text class="tip-t" x="${tx + tw / 2}" y="${ty + 13.5}" text-anchor="middle">${label}</text>`;
      }
    });
    return s + '</svg>';
  }
  const PIE_COLORS = ['var(--laque)', 'var(--or)', 'var(--laque-2)', 'color-mix(in srgb, var(--laque) 50%, var(--or))', 'var(--sourdine)'];
  function pie(groups, total, centerText, centerSub) {
    const r = 52, c = 2 * Math.PI * r; let off = 0;
    const arcs = groups.map((g, i) => { const len = c * g.amount / total; const el = `<circle class="arc" cx="70" cy="70" r="${r}" style="stroke:${PIE_COLORS[i]}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += len; return el; }).join('');
    return `<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="Répartition des revenus"><circle class="track" cx="70" cy="70" r="${r}"/>${arcs}<text class="center" x="70" y="67">${centerText}</text><text class="center-k" x="70" y="83">${centerSub}</text></svg>`;
  }

  /* ---------- Vue : tableau de bord ---------- */
  const dashState = { period: 'current', from: '', to: '', scope: 'year', selected: null };
  let redraw = null;
  async function renderDashboard() {
    const q = new URLSearchParams({ period: dashState.period, from: dashState.from, to: dashState.to });
    const d = await api('/dashboard?' + q);
    const k = d.kpis;
    const prevKind = dashState.period === 'current' ? 'previous' : dashState.period === 'year' ? 'previous_year' : null;
    const prev = prevKind ? await api('/dashboard?period=' + prevKind) : null;
    const prevRef = dashState.period === 'year' ? String(new Date().getFullYear() - 1) : fmtMonth(lastMonths(2)[0]);
    const series = await api('/stats/revenue?scope=' + dashState.scope);
    if (!dashState.selected || !series.items.some((x) => x.key === dashState.selected)) dashState.selected = series.current;
    const rate = (k.contribution_rate * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    const pct = Math.min(100, d.goal.progress_pct);
    const base = k.revenue > 0 ? k.revenue : 1;
    const seg = (v) => k.revenue > 0 ? Math.max(0, Math.min(100, (v / base) * 100)) : 0;
    const periodLabel = dashState.period === 'current' ? `Résumé de l'activité du mois ${deMonth()}` : dashState.period === 'year' ? `Résumé de l'activité de l'année ${new Date().getFullYear()}` : `Résumé de l'activité du ${fmtDate(d.period.from)} au ${fmtDate(d.period.to)}`;
    const periodWord = dashState.period === 'current' ? 'ce mois-ci' : dashState.period === 'year' ? 'cette année' : 'sur la période';
    let groups = d.revenue_by_type.slice(0, 4);
    const rest = d.revenue_by_type.slice(4).reduce((s, g) => s + g.amount, 0);
    if (rest > 0) groups = [...groups, { label: 'Autres', amount: rest, other: true }];
    const revTotal = groups.reduce((s, g) => s + g.amount, 0);
    const name = state.user.name ? `, ${esc(state.user.name)}` : '';
    view.innerHTML = `
      <div class="greet greet-row">
        <div><h2>Bonjour${name} !</h2><p>${periodLabel}</p></div>
        <select id="period" class="period-select" aria-label="Période">
          <option value="current" ${dashState.period === 'current' ? 'selected' : ''}>Mois en cours</option>
          <option value="year" ${dashState.period === 'year' ? 'selected' : ''}>Année en cours</option>
          <option value="custom" ${dashState.period === 'custom' ? 'selected' : ''}>Autre période</option>
        </select>
      </div>
      <div class="row ${dashState.period === 'custom' ? '' : 'hidden'}" id="custom-range" style="margin-bottom:14px">
        <div><label>Du</label><input type="date" id="from" value="${dashState.from}"></div><div><label>Au</label><input type="date" id="to" value="${dashState.to}"></div>
      </div>

      <section class="card ecrin"><div class="hero-figure">
        <p class="lede">Reste estimé</p>
        <div class="value num ${k.remaining < 0 ? 'negative' : ''}">${fmtMoney(k.remaining)}</div>
        <div class="lacquer"><span class="seg-dep" style="width:0"></span><span class="seg-cot" style="width:0"></span><span class="seg-reste" style="width:0"></span></div>
        <div class="legend">
          <span style="--c:var(--laque)">Dépenses <b>${fmtMoney(k.expenses)}</b></span>
          <span style="--c:color-mix(in srgb, var(--laque) 45%, var(--encre))">Cotisations ${rate} % <b>${fmtMoney(k.contributions)}</b></span>
          <span style="--c:var(--or)">Reste <b>${fmtMoney(Math.max(0, k.remaining))}</b></span>
        </div>
        <p class="small muted" style="margin:12px 0 0">Chiffre d'affaires − dépenses − cotisations estimées. Une estimation, pas un résultat comptable. <a href="./app.html#parametres">Changer le taux</a></p>
      </div></section>

      <div class="kpis">
        <div class="card poudre kpi main"><div class="k">Chiffre d'affaires ${ico('in')}</div><div class="v">${fmtMoney(k.revenue)}</div>${prev ? pctHtml(k.revenue, prev.kpis.revenue, prevRef) : ''}</div>
        <div class="card poudre kpi out"><div class="k">Dépenses ${ico('out')}</div><div class="v">${fmtMoney(k.expenses)}</div>${prev ? pctHtml(k.expenses, prev.kpis.expenses, prevRef) : ''}</div>
        <div class="card poudre kpi"><div class="k">Cotisations ${ico('rest')}</div><div class="v">${fmtMoney(k.contributions)}</div><div class="d">${rate} % du chiffre d'affaires</div></div>
        <div class="card poudre kpi"><div class="k">Prestations ${ico('bottle')}</div><div class="v">${k.services}</div>${prev ? pctHtml(k.services, prev.kpis.services, prevRef) : ''}</div>
      </div>

      <div class="dash-grid">
          <section class="card dash-chart">
            <div class="card-head"><h3>Évolution du chiffre d'affaires</h3>
              <select id="scope" class="period-select small-select" aria-label="Période du graphique"><option value="year" ${dashState.scope === 'year' ? 'selected' : ''}>Année</option><option value="week" ${dashState.scope === 'week' ? 'selected' : ''}>Semaine</option></select></div>
            <div id="chart-rev" class="chart-slot"></div>
            <p class="help" style="margin:4px 0 0">${dashState.scope === 'year' ? `Année ${series.current.slice(0, 4)}, par mois.` : `Semaine du ${fmtDate(series.from)} au ${fmtDate(series.to)}, par jour.`} Touche une barre pour lire sa valeur.</p>
          </section>
          <section class="card">
            <div class="card-head"><h3>Répartition des revenus</h3><a class="small" href="./app.html#operations">Revenus</a></div>
            ${revTotal > 0 ? `<div class="donut-wrap">${pie(groups, revTotal, fmtMoney(revTotal), periodWord)}<div class="donut-legend">${groups.map((g, i) => `<div class="${g.other ? 'other' : ''}"><i style="--c:${PIE_COLORS[i]}"></i><span>${esc(g.label)}</span><b>${Math.round((g.amount / revTotal) * 100)} %<small>${fmtMoney(g.amount)}</small></b></div>`).join('')}</div></div>` : '<div class="empty"><strong>Aucun revenu sur la période.</strong>Les quatre principaux types de revenus apparaîtront ici.</div>'}
          </section>
          <section class="card poudre goal-card">
            <div class="card-head"><h3>Objectifs du mois</h3><a class="btn btn-ghost btn-sm" href="./app.html#objectifs">Modifier</a></div>
            ${d.goal.goal > 0 ? `
              <p class="goal-line">Atteindre <b>${fmtMoney(d.goal.goal)}</b> de chiffre d'affaires</p>
              <div class="progress black"><span style="width:${pct}%"></span></div>
              <div class="goal-row"><span><b>${fmtMoney(d.goal.achieved)}</b> / ${fmtMoney(d.goal.goal)}</span><span class="goal-pct">${Math.round(d.goal.progress_pct)} %</span></div>
              ${d.goal.remaining_services !== null && d.goal.remaining_services > 0 ? `<p class="small muted" style="margin:10px 0 0">Encore ${d.goal.remaining_services} prestation${d.goal.remaining_services > 1 ? 's' : ''} à ${fmtMoney(d.goal.average_price)}.</p>` : d.goal.remaining_services === 0 ? '<p class="small" style="margin:10px 0 0">Objectif atteint.</p>' : ''}`
            : `<div class="empty"><strong>Pas encore d'objectif.</strong><a href="./app.html#objectifs">Définir un objectif mensuel</a></div>`}
          </section>
      </div>`;
    redraw = () => {
      const slot = qs('#chart-rev'); if (!slot) return;
      const W = Math.max(260, slot.clientWidth);
      const labels = series.items.map((x, i) => dashState.scope === 'year' ? MONTHS_SHORT[i] : DAYS_SHORT[i]);
      slot.innerHTML = revChart(series.items, labels, series.current, dashState.selected, W);
    };
    redraw();
    qs('#chart-rev').addEventListener('click', (e) => { const t = e.target.closest('[data-key]'); if (!t) return; dashState.selected = t.dataset.key; redraw(); });
    requestAnimationFrame(() => {
      const segs = view.querySelectorAll('.lacquer > span');
      [k.expenses, k.contributions, Math.max(0, k.remaining)].forEach((v, i) => { segs[i].style.width = seg(v) + '%'; });
    });
    qs('#period').addEventListener('change', (e) => { dashState.period = e.target.value; if (dashState.period !== 'custom') renderDashboard(); else qs('#custom-range').classList.remove('hidden'); });
    qs('#scope').addEventListener('change', (e) => { dashState.scope = e.target.value; dashState.selected = null; renderDashboard(); });
    ['from', 'to'].forEach((id) => qs('#' + id).addEventListener('change', () => { dashState.from = qs('#from').value; dashState.to = qs('#to').value; if (dashState.from && dashState.to) renderDashboard(); }));
  }
  let resizeT; window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (redraw && qs('.chart-slot')) redraw(); }, 150); });

  /* ---------- Vue : revenus & dépenses ---------- */
  const opsState = { tab: 'income', month: ymOf(today()) };
  const amountCell = (t) => `<td class="amt ${t.type}">${t.type === 'income' ? '+' : '−'}${fmtMoney(t.amount)}</td>`;
  async function renderOperations() {
    const b = monthBounds(opsState.month);
    const [all, clients] = await Promise.all([api(`/transactions?from=${b.from}&to=${b.to}`), api('/clients')]);
    const names = Object.fromEntries(clients.items.map((c) => [c.id, c.display]));
    const rows = all.items.filter((t) => t.type === opsState.tab);
    const total = rows.reduce((s, t) => s + t.amount, 0);
    const gains = all.items.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const losses = all.items.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const months = [...new Set((await api('/transactions')).items.map((t) => ymOf(t.date)))].filter((m) => m < ymOf(today())).sort().reverse();
    const trRow = (t, arrows = false) => `<tr data-id="${t.id}"><td class="dt"><span>${fmtDate(t.date)}</span>${t.date > today() ? '<span class="tag">à venir</span>' : ''}</td><td class="ty">${esc(t.label)}${t.client_id && names[t.client_id] ? `<small>${esc(names[t.client_id])}</small>` : ''}</td>${arrows ? `<td class="amt ${t.type}"><svg class="arrow"><use href="#i-${t.type === 'income' ? 'up' : 'down'}"/></svg>${fmtMoney(t.amount)}</td>` : amountCell(t)}</tr>`;
    view.innerHTML = `
      <section class="card table-card">
        <div class="ops-head">
          <div class="segmented ops-tabs"><button type="button" data-tab="income" class="${opsState.tab === 'income' ? 'active' : ''}">Revenus</button><button type="button" data-tab="expense" class="${opsState.tab === 'expense' ? 'active' : ''}">Dépenses</button></div>
          <button class="btn btn-primary" id="add">${ico('plus')}Ajouter une opération</button>
        </div>
        <div class="month-nav"><button class="icon-btn" id="m-prev" aria-label="Mois précédent"><svg><use href="#i-back"/></svg></button><b>${monthLabel(opsState.month)}</b><button class="icon-btn" id="m-next" aria-label="Mois suivant" ${opsState.month >= ymOf(today()) ? 'disabled' : ''}><svg><use href="#i-chev"/></svg></button></div>
        <table class="ops">
          <thead><tr><th>Date</th><th>Type</th><th class="r">Montant</th></tr></thead>
          <tbody id="ops-body">${rows.length ? rows.map((t) => trRow(t)).join('') : `<tr class="empty-row"><td colspan="3">Aucun${opsState.tab === 'income' ? ' revenu' : 'e dépense'} ce mois-ci.</td></tr>`}</tbody>
          <tfoot><tr><td colspan="2"><b>Total du mois</b><small>${monthLabel(opsState.month)}</small></td><td class="amt ${opsState.tab}">${fmtMoney(total)}</td></tr></tfoot>
        </table>
      </section>

      <section class="card table-card">
        <div class="card-head"><h3>Mouvements du mois</h3><span class="small muted">${all.items.length} opération${all.items.length > 1 ? 's' : ''}</span></div>
        <table class="ops">
          <thead><tr><th>Date</th><th>Type</th><th class="r">Montant</th></tr></thead>
          <tbody id="mv-body">${all.items.length ? all.items.map((t) => trRow(t, true)).join('') : '<tr class="empty-row"><td colspan="3">Rien ce mois-ci.</td></tr>'}</tbody>
          <tfoot><tr><td colspan="2"><b>Différence</b><small>Gains ${fmtMoney(gains)} · Pertes ${fmtMoney(losses)}</small></td><td class="amt ${gains - losses >= 0 ? 'income' : 'expense'}">${gains - losses >= 0 ? '+' : '−'}${fmtMoney(Math.abs(gains - losses))}</td></tr></tfoot>
        </table>
      </section>

      <section class="card poudre">
        <div class="card-head"><h3>Archives</h3><button class="btn btn-ghost btn-sm" id="pdf-now">${ico('pdf')}PDF de ce mois</button></div>
        ${months.length ? `<div class="list">${months.map((m) => `<div class="item"><div class="main"><div class="title">${monthLabel(m)}</div></div><button class="btn btn-ghost btn-sm" data-pdf="${m}">${ico('pdf')}PDF</button></div>`).join('')}</div>` : '<p class="small muted" style="margin:0">Les mois passés apparaîtront ici, avec leur relevé en PDF.</p>'}
      </section>`;
    const refresh = () => renderOperations();
    view.querySelectorAll('[data-tab]').forEach((bt) => bt.addEventListener('click', () => { opsState.tab = bt.dataset.tab; refresh(); }));
    qs('#add').addEventListener('click', () => txForm({}, refresh, { type: opsState.tab }));
    qs('#m-prev').addEventListener('click', () => { opsState.month = shiftMonth(opsState.month, -1); refresh(); });
    qs('#m-next').addEventListener('click', () => { opsState.month = shiftMonth(opsState.month, 1); refresh(); });
    const edit = (e) => { const tr = e.target.closest('tr[data-id]'); if (!tr) return; const t = all.items.find((x) => x.id === Number(tr.dataset.id)); if (t) txForm(t, refresh); };
    qs('#ops-body').addEventListener('click', edit); qs('#mv-body').addEventListener('click', edit);
    const makePdf = async (ym) => {
      const bb = monthBounds(ym); const r = await api(`/transactions?from=${bb.from}&to=${bb.to}`);
      const items = [...r.items].sort((a, c) => a.date.localeCompare(c.date) || a.id - c.id);
      const rev = items.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0), exp = items.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      const blob = BBM.pdf.monthStatement({ title: monthLabel(ym), subtitle: 'Revenus et dépenses du mois', business: state.user.business_name || (state.user.name ? `${state.user.name} — The Beauty Business Manager` : 'The Beauty Business Manager'), rows: items, revenue: rev, expenses: exp });
      BBM.local.download(`releve-${ym}.pdf`, blob); toast('PDF téléchargé');
    };
    qs('#pdf-now').addEventListener('click', () => makePdf(opsState.month));
    view.querySelectorAll('[data-pdf]').forEach((bt) => bt.addEventListener('click', () => makePdf(bt.dataset.pdf)));
  }

  /* ---------- Vue : clients ---------- */
  const cliState = { q: '', limit: 10, mode: 'rdv' };
  async function renderClients() {
    const [appts, clients] = await Promise.all([api(`/appointments?q=${encodeURIComponent(cliState.q)}&offset=0&limit=${cliState.limit}`), api(`/clients?q=${encodeURIComponent(cliState.q)}`)]);
    const groups = []; for (const a of appts.items) { const m = ymOf(a.date); const last = groups[groups.length - 1]; if (last && last.month === m) last.items.push(a); else groups.push({ month: m, items: [a] }); }
    view.innerHTML = `
      <section class="card table-card">
        <div class="ops-head">
          <div class="search" style="flex:1"><svg><use href="#i-search"/></svg><input id="c-q" placeholder="Rechercher un client" value="${esc(cliState.q)}" enterkeyhint="search"></div>
          <button class="btn btn-primary" id="c-add">${ico('plus')}Ajouter un client</button>
        </div>
        <div class="segmented ops-tabs" style="margin-bottom:6px"><button type="button" data-mode="rdv" class="${cliState.mode === 'rdv' ? 'active' : ''}">Rendez-vous</button><button type="button" data-mode="list" class="${cliState.mode === 'list' ? 'active' : ''}">Toutes les clientes (${clients.total})</button></div>
        ${cliState.mode === 'rdv' ? (groups.length ? `<div class="list" id="c-list">${groups.map((g) => `<div class="day-head"><span>${monthLabel(g.month)}</span></div>${g.items.map((a) => `
          <div class="item" data-client="${a.client_id}"><div class="main"><div class="title">${esc(a.client)}${a.upcoming ? ' <span class="tag">à venir</span>' : ''}</div><div class="sub">${fmtDate(a.date)} · ${esc(a.label)}</div></div><div class="amount income">${fmtMoney(a.amount)}</div><svg class="chev"><use href="#i-chev"/></svg></div>`).join('')}`).join('')}</div>
          ${appts.total > appts.items.length ? `<button class="btn btn-ghost btn-block" id="c-more" style="margin-top:12px">Voir plus (${appts.total - appts.items.length})</button>` : ''}`
          : `<div class="empty"><strong>${clients.total ? 'Aucun rendez-vous pour l\'instant.' : 'Aucune cliente pour l\'instant.'}</strong>${clients.total ? 'Ouvre une fiche et ajoute un rendez-vous, ou rattache une cliente à un revenu.' : 'Ajoute une cliente : ses rendez-vous apparaîtront ici, mois par mois.'}</div>`)
        : (clients.items.length ? `<div class="list" id="c-list">${clients.items.map((c) => `
          <div class="item" data-client="${c.id}"><div class="main"><div class="title">${esc(c.display)}</div><div class="sub">${c.visits} visite${c.visits > 1 ? 's' : ''}${c.last_date ? ' · dernière le ' + fmtDate(c.last_date) : ''}${c.next_date ? ' · prochaine le ' + fmtDate(c.next_date) : ''}</div></div><div class="amount income">${fmtMoney(c.total)}</div><svg class="chev"><use href="#i-chev"/></svg></div>`).join('')}</div>` : '<div class="empty"><strong>Aucune cliente.</strong>Ajoute une cliente avec le bouton ci-dessus.</div>')}
      </section>`;
    const refresh = () => renderClients();
    qs('#c-add').addEventListener('click', () => clientForm({}, (c) => navigate(`/app/clients/${c.id}`)));
    let t; qs('#c-q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { cliState.q = e.target.value; cliState.limit = 10; refresh(); }, 300); });
    view.querySelectorAll('[data-mode]').forEach((bt) => bt.addEventListener('click', () => { cliState.mode = bt.dataset.mode; refresh(); }));
    const more = qs('#c-more'); if (more) more.addEventListener('click', () => { cliState.limit += 10; refresh(); });
    const list = qs('#c-list'); if (list) list.addEventListener('click', (e) => { const it = e.target.closest('[data-client]'); if (it) navigate(`/app/clients/${it.dataset.client}`); });
  }
  async function renderClient(id) {
    const c = await api(`/clients/${id}`);
    const initials = (c.first_name.charAt(0) + (c.last_name ? c.last_name.charAt(0) : '')).toUpperCase();
    const past = c.visits.filter((v) => v.date <= c.today), future = c.visits.filter((v) => v.date > c.today);
    const row = (v) => `<div class="item" data-id="${v.id}"><div class="main"><div class="title">${esc(v.label)}</div><div class="sub">${fmtDate(v.date)}${v.note ? ' · ' + esc(v.note) : ''}</div></div><div class="amount income">${fmtMoney(v.amount)}</div></div>`;
    view.innerHTML = `
      <a class="back" href="./app.html#clients">${ico('back')}Clients</a>
      <section class="card poudre client-head">
        <div class="client-avatar">${initials}</div>
        <div class="client-id"><h2>${esc(c.first_name)} ${esc(c.last_name || '')}</h2>
          <div class="client-contacts">${c.phone ? `<a class="btn btn-ghost btn-sm" href="tel:${esc(c.phone.replace(/\s/g, ''))}">${ico('phone')}${esc(c.phone)}</a>` : ''}${c.email ? `<a class="btn btn-ghost btn-sm" href="mailto:${esc(c.email)}">${ico('mail')}${esc(c.email)}</a>` : ''}</div>
          ${c.note ? `<p class="client-note">${esc(c.note)}</p>` : ''}
        </div>
        <div class="actions"><button class="btn btn-primary" id="c-rdv">${ico('plus')}Rendez-vous</button><button class="btn btn-ghost" id="c-edit">Modifier</button></div>
      </section>
      <div class="kpis kpis-3">
        <div class="card poudre kpi"><div class="k">Visites</div><div class="v">${c.visits_count ?? past.length}</div></div>
        <div class="card poudre kpi main"><div class="k">Total</div><div class="v">${fmtMoney(c.total)}</div></div>
        <div class="card poudre kpi"><div class="k">${c.next_date ? 'Prochain rendez-vous' : 'Dernière visite'}</div><div class="v small-v">${c.next_date ? fmtDate(c.next_date) : c.last_date ? fmtDate(c.last_date) : '—'}</div></div>
      </div>
      ${future.length ? `<section class="card poudre"><div class="card-head"><h3>À venir</h3></div><div class="list" data-visits>${future.map(row).join('')}</div></section>` : ''}
      <section class="card poudre">
        <div class="card-head"><h3>Historique</h3><span class="small muted">${past.length} visite${past.length > 1 ? 's' : ''}</span></div>
        ${past.length ? `<div class="list" data-visits>${past.map(row).join('')}</div>` : '<div class="empty"><strong>Pas encore de visite.</strong>Ajoute un rendez-vous : il compte dans les revenus à sa date.</div>'}
      </section>
      <p class="small muted" style="margin:16px 0 0;text-align:right"><a href="#" id="c-del">Supprimer cette fiche</a></p>`;
    const refresh = () => renderClient(id);
    qs('#c-rdv').addEventListener('click', () => txForm({}, refresh, { type: 'income', client_id: id }));
    qs('#c-edit').addEventListener('click', () => clientForm(c, refresh));
    qs('#c-del').addEventListener('click', async (e) => { e.preventDefault(); if (await confirmDialog('Supprimer cette fiche ?', `${c.display}. Ses revenus restent dans le journal, sans cliente rattachée.`)) { await api(`/clients/${id}`, { method: 'DELETE' }); toast('Fiche supprimée'); navigate('/app/clients'); } });
    view.querySelectorAll('[data-visits]').forEach((l) => l.addEventListener('click', (e) => { const it = e.target.closest('.item'); if (!it) return; const v = c.visits.find((x) => x.id === Number(it.dataset.id)); if (v) txForm(v, refresh); }));
  }

  /* ---------- Vue : abonnements ---------- */
  async function renderSubscriptions() {
    const d = await api('/subscriptions');
    const when = (s) => s.days_until < 0 ? 'en retard' : s.days_until === 0 ? 'aujourd\'hui' : s.days_until === 1 ? 'demain' : `dans ${s.days_until} j`;
    const subItem = (s) => `
      <div class="item ${s.due_soon ? 'due-soon' : ''}" data-id="${s.id}">
        <div class="main">
          <div class="title">${esc(s.name)} ${s.status === 'active' ? '' : `<span class="tag off">${STATUS[s.status]}</span>`}</div>
          <div class="sub">${FREQ[s.frequency].replace('N', s.custom_months || 'N')}, le ${fmtDate(s.next_charge_date)}${s.status === 'active' ? ` (${when(s)})` : ''}. ${fmtMoney(s.monthly_cost)} par mois.</div>
        </div>
        <div class="amount expense">${fmtMoney(s.amount)}</div>
        <div class="actions">
          ${s.status === 'active' ? `<button class="icon-btn" data-confirm title="Confirmer le prélèvement" aria-label="Confirmer le prélèvement">${ico('check')}</button>` : ''}
          <button class="icon-btn" data-del title="Supprimer" aria-label="Supprimer">${ico('del')}</button>
        </div>
      </div>`;
    view.innerHTML = `
      <div class="figures">
        <div class="card poudre figure out"><div class="k">Par mois, abonnements actifs</div><div class="v">${fmtMoney(d.totals.monthly)}</div></div>
        <div class="card poudre figure out"><div class="k">Par an</div><div class="v">${fmtMoney(d.totals.yearly)}</div></div>
      </div>
      <section class="card poudre">
        <div class="card-head"><h3>${d.items.length} abonnement${d.items.length > 1 ? 's' : ''}</h3><button class="btn btn-ghost btn-sm" id="add">${ico('plus')}Ajouter</button></div>
        <p class="small muted" style="margin:0 0 6px">La coche confirme un prélèvement : il passe dans les dépenses et l'échéance avance. Touche une ligne pour la modifier.</p>
        ${d.items.length ? `<div class="list" id="sub-list">${d.items.map(subItem).join('')}</div>` : `<div class="empty"><strong>Aucun abonnement.</strong>Prise de rendez-vous, logiciels, assurance, banque : ajoute-les pour voir ce qu'ils coûtent vraiment et quand ils tombent.</div>`}
      </section>`;
    const refresh = () => renderSubscriptions();
    qs('#add').addEventListener('click', () => subForm({}, refresh));
    const list = qs('#sub-list');
    if (list) list.addEventListener('click', async (e) => {
      const item = e.target.closest('.item'); if (!item) return;
      const s = d.items.find((x) => x.id === Number(item.dataset.id));
      if (e.target.closest('[data-confirm]')) {
        modal(`<h3>Confirmer le prélèvement</h3><p class="muted small">Une dépense « ${esc(s.name)} » est ajoutée et la prochaine échéance avance d'une période.</p>
          <div class="row"><div class="field"><label>Montant, €</label><input name="amount" type="number" step="0.01" min="0" inputmode="decimal" value="${s.amount}"></div><div class="field"><label>Date du prélèvement</label><input name="date" type="date" value="${s.next_charge_date}"></div></div>
          <div class="error" data-error></div>
          <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-close>Annuler</button><button class="btn btn-primary" type="submit">Confirmer</button></div>`,
        async (data) => { await api(`/subscriptions/${s.id}/confirm`, { method: 'POST', body: data }); toast('Prélèvement ajouté aux dépenses'); refresh(); });
        return;
      }
      if (e.target.closest('[data-del]')) {
        if (await confirmDialog('Supprimer cet abonnement ?', `${s.name}. Les prélèvements déjà confirmés restent dans les dépenses.`)) { await api(`/subscriptions/${s.id}`, { method: 'DELETE' }); toast('Supprimé'); refresh(); }
        return;
      }
      subForm(s, refresh);
    });
  }

  /* ---------- Vue : objectifs ---------- */
  async function renderGoals() {
    const d = await api('/dashboard');
    const s = state.settings;
    const pct = Math.min(100, d.goal.progress_pct);
    view.innerHTML = `
      <div class="two-col">
        <form class="card poudre" id="goal-form">
          <div class="card-head"><h3>Ton objectif</h3></div>
          <div class="field"><label>Chiffre d'affaires visé par mois, €</label><input name="monthly_goal" type="number" step="0.01" min="0" inputmode="decimal" value="${s.monthly_goal || ''}" placeholder="1500"></div>
          <div class="field"><label>Prix moyen d'une prestation, €</label><input name="average_price" type="number" step="0.01" min="0" inputmode="decimal" value="${s.average_price || ''}" placeholder="45"></div>
          <p class="help" style="margin:-6px 0 14px">Le prix moyen sert à compter les prestations qu'il reste à faire.</p>
          <div class="error" data-error></div>
          <button class="btn btn-primary" type="submit">Enregistrer</button>
        </form>
        <section class="card ecrin" style="margin-bottom:0">
          <div class="card-head"><h3>${cap(monthName())}</h3></div>
          ${s.monthly_goal > 0 ? `
            <div class="hero-figure"><div class="value num" style="font-size:2.8rem">${fmtMoney(d.goal.achieved)}</div><p class="muted small">sur ${fmtMoney(s.monthly_goal)}, ${Math.round(d.goal.progress_pct)} %</p></div>
            <div class="progress black"><span style="width:${pct}%"></span></div>
            <p style="margin-top:14px;font-family:var(--display);font-size:1.4rem">${d.goal.remaining_services === null ? '<span class="muted small" style="font-family:var(--ui)">Indique un prix moyen pour compter les prestations restantes.</span>' : d.goal.remaining_services === 0 ? 'Objectif atteint.' : `Encore ${d.goal.remaining_services} prestation${d.goal.remaining_services > 1 ? 's' : ''} à ${fmtMoney(s.average_price)}.`}</p>
            <p class="small muted" style="margin:0">Arrondi au-dessus de (objectif − chiffre d'affaires) ÷ prix moyen.</p>`
          : '<div class="empty"><strong>Pas encore d\'objectif.</strong>Renseigne-le pour suivre le mois.</div>'}
        </section>
      </div>`;
    qs('#goal-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      try { state.settings = await api('/settings/goals', { method: 'PUT', body: Object.fromEntries(new FormData(f)) }); toast('Enregistré'); renderGoals(); }
      catch (ex) { qs('[data-error]', f).textContent = ex.message; }
    });
  }

  /* ---------- Vue : rapports ---------- */
  const repState = { period: 'current', from: '', to: '' };
  async function renderReports() {
    const q = new URLSearchParams({ period: repState.period, from: repState.from, to: repState.to });
    const d = await api('/dashboard?' + q);
    const prevKind = repState.period === 'current' ? 'previous' : repState.period === 'previous' ? null : repState.period === 'year' ? 'previous_year' : null;
    const prev = prevKind ? await api('/dashboard?period=' + prevKind) : null;
    const prevRef = repState.period === 'year' ? String(new Date().getFullYear() - 1) : fmtMonth(lastMonths(2)[0]);
    const [txs, clients] = await Promise.all([api(`/transactions?from=${d.period.from}&to=${d.period.to}`), api('/clients')]);
    const done = txs.items.filter((t) => t.date <= d.today);
    const k = d.kpis;
    const byType = d.revenue_by_type.map((g) => ({ ...g, pct: k.revenue > 0 ? Math.round((g.amount / k.revenue) * 100) : 0 }));
    const perClient = {}; for (const t of done) if (t.type === 'income' && t.client_id) { perClient[t.client_id] = perClient[t.client_id] || { visits: 0, total: 0 }; perClient[t.client_id].visits++; perClient[t.client_id].total += t.amount; }
    const names = Object.fromEntries(clients.items.map((c) => [c.id, c.display]));
    const topClients = Object.entries(perClient).map(([id, v]) => ({ display: names[id] || '?', ...v })).sort((a, b) => b.total - a.total).slice(0, 5);
    const title = repState.period === 'current' ? monthLabel(ymOf(d.today)) : repState.period === 'previous' ? monthLabel(shiftMonth(ymOf(d.today), -1)) : repState.period === 'year' ? `Année ${d.today.slice(0, 4)}` : `Du ${fmtDate(d.period.from)} au ${fmtDate(d.period.to)}`;
    const basket = k.services > 0 ? k.revenue / k.services : 0;
    view.innerHTML = `
      <div class="greet greet-row">
        <div><h2>${title}</h2><p>Synthèse de la période</p></div>
        <select id="r-period" class="period-select" aria-label="Période">
          <option value="current" ${repState.period === 'current' ? 'selected' : ''}>Mois en cours</option>
          <option value="previous" ${repState.period === 'previous' ? 'selected' : ''}>Mois dernier</option>
          <option value="year" ${repState.period === 'year' ? 'selected' : ''}>Année en cours</option>
          <option value="custom" ${repState.period === 'custom' ? 'selected' : ''}>Autre période</option>
        </select>
      </div>
      <div class="row ${repState.period === 'custom' ? '' : 'hidden'}" id="r-range" style="margin-bottom:14px"><div><label>Du</label><input type="date" id="r-from" value="${repState.from}"></div><div><label>Au</label><input type="date" id="r-to" value="${repState.to}"></div></div>
      <div class="kpis kpis-3">
        <div class="card poudre kpi main"><div class="k">Chiffre d'affaires</div><div class="v">${fmtMoney(k.revenue)}</div>${prev ? pctHtml(k.revenue, prev.kpis.revenue, prevRef) : ''}</div>
        <div class="card poudre kpi out"><div class="k">Dépenses</div><div class="v">${fmtMoney(k.expenses)}</div>${prev ? pctHtml(k.expenses, prev.kpis.expenses, prevRef) : ''}</div>
        <div class="card poudre kpi"><div class="k">Reste estimé</div><div class="v">${fmtMoney(k.remaining)}</div>${prev ? pctHtml(k.remaining, prev.kpis.remaining, prevRef) : ''}</div>
        <div class="card poudre kpi"><div class="k">Cotisations estimées</div><div class="v">${fmtMoney(k.contributions)}</div><div class="d">${(k.contribution_rate * 100).toLocaleString('fr-FR')} % du CA</div></div>
        <div class="card poudre kpi"><div class="k">Prestations</div><div class="v">${k.services}</div>${prev ? pctHtml(k.services, prev.kpis.services, prevRef) : ''}</div>
        <div class="card poudre kpi"><div class="k">Panier moyen</div><div class="v">${fmtMoney(basket)}</div><div class="d">par prestation</div></div>
      </div>
      <div class="two-col">
        <section class="card">
          <div class="card-head"><h3>Revenus par type</h3></div>
          ${byType.length ? `<table class="ops compact"><thead><tr><th>Type</th><th class="r">Part</th><th class="r">Montant</th></tr></thead><tbody>${byType.map((g) => `<tr><td class="ty">${esc(g.label)}</td><td class="r">${g.pct} %</td><td class="amt income">${fmtMoney(g.amount)}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted" style="margin:0">Aucun revenu sur la période.</p>'}
        </section>
        <section class="card">
          <div class="card-head"><h3>Meilleures clientes</h3><a class="small" href="./app.html#clients">Clients</a></div>
          ${topClients.length ? `<table class="ops compact"><thead><tr><th>Cliente</th><th class="r">Visites</th><th class="r">Total</th></tr></thead><tbody>${topClients.map((c) => `<tr><td class="ty">${esc(c.display)}</td><td class="r">${c.visits}</td><td class="amt income">${fmtMoney(c.total)}</td></tr>`).join('')}</tbody></table>` : '<p class="small muted" style="margin:0">Rattache tes revenus à des clientes pour les voir ici.</p>'}
        </section>
      </div>
      <div class="actions" style="justify-content:center;margin-top:18px"><button class="btn btn-primary" id="r-pdf">${ico('pdf')}Télécharger le rapport en PDF</button></div>`;
    qs('#r-period').addEventListener('change', (e) => { repState.period = e.target.value; if (repState.period !== 'custom') renderReports(); else qs('#r-range').classList.remove('hidden'); });
    ['r-from', 'r-to'].forEach((id) => qs('#' + id).addEventListener('change', () => { repState.from = qs('#r-from').value; repState.to = qs('#r-to').value; if (repState.from && repState.to) renderReports(); }));
    qs('#r-pdf').addEventListener('click', () => {
      const rows = [...done].sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id);
      const blob = BBM.pdf.report({ title: `Rapport — ${title}`, subtitle: `Du ${fmtDate(d.period.from)} au ${fmtDate(d.period.to)}`, business: state.user.business_name || (state.user.name ? `${state.user.name} — The Beauty Business Manager` : 'The Beauty Business Manager'),
        kpis: [{ label: "Chiffre d'affaires", value: fmtMoney(k.revenue) }, { label: 'Dépenses', value: fmtMoney(k.expenses) }, { label: 'Cotisations estimées', value: fmtMoney(k.contributions) }, { label: 'Reste estimé', value: fmtMoney(k.remaining) }],
        byType, clients: topClients, rows, revenue: k.revenue, expenses: k.expenses });
      BBM.local.download(`rapport-${d.period.from}-${d.period.to}.pdf`, blob); toast('PDF téléchargé');
    });
  }

  /* ---------- Vue : statistiques ---------- */
  const statState = { period: '6m', sel: {} };
  let statRedraws = [];
  async function renderStats() {
    const CH = BBM.charts;
    const [tx, clientsRes] = await Promise.all([api('/transactions'), api('/clients')]);
    const t = today(); const done = tx.items.filter((x) => x.date <= t);
    const rate = state.settings.contribution_rate, goal = state.settings.monthly_goal;
    const nowYm = ymOf(t);
    let months;
    if (statState.period === 'year') { const y = t.slice(0, 4); months = []; for (let m = 1; m <= Number(t.slice(5, 7)); m++) months.push(`${y}-${pad(m)}`); }
    else if (statState.period === 'all') { const first = done.length ? done.map((x) => ymOf(x.date)).sort()[0] : nowYm; months = []; let m = first; let guard = 0; while (m <= nowYm && guard++ < 60) { months.push(m); m = shiftMonth(m, 1); } if (months.length < 3) months = lastMonths(3); }
    else months = lastMonths({ '3m': 3, '6m': 6, '12m': 12 }[statState.period] || 6);
    const from = months[0] + '-01';
    const inP = done.filter((x) => x.date >= from);
    const incomes = inP.filter((x) => x.type === 'income'), expenses = inP.filter((x) => x.type === 'expense');
    const sum = (list) => C.round2(list.reduce((a, x) => a + x.amount, 0));
    /* première visite de chaque cliente, sur tout l'historique */
    const firstVisit = {}; for (const x of [...done].sort((a, b) => a.date.localeCompare(b.date))) if (x.type === 'income' && x.client_id && !firstVisit[x.client_id]) firstVisit[x.client_id] = x.date;
    const M = months.map((m) => {
      const inc = incomes.filter((x) => x.date.startsWith(m)), exp = expenses.filter((x) => x.date.startsWith(m));
      const rev = sum(inc), ex = sum(exp), cot = C.estimatedContributions(rev, rate);
      const presta = inc.filter((x) => x.category === 'prestation').length;
      const newVisits = inc.filter((x) => x.client_id && firstVisit[x.client_id] && firstVisit[x.client_id].startsWith(m)).length;
      const withClient = inc.filter((x) => x.client_id).length;
      return { m, rev, ex, cot, rest: C.round2(rev - ex - cot), presta, count: inc.length, basket: inc.length ? rev / inc.length : 0, newClients: Object.values(firstVisit).filter((d) => d.startsWith(m)).length, newVisits, oldVisits: withClient - newVisits, loyalPct: withClient ? ((withClient - newVisits) / withClient) * 100 : 0, goalPct: goal > 0 ? (rev / goal) * 100 : 0 };
    });
    const labels = months.map((m) => months.length > 12 ? fmtMonth(m).replace('.', '') + ' ' + m.slice(2, 4) : fmtMonth(m).replace('.', ''));
    const totRev = sum(incomes), totExp = sum(expenses), totCot = C.estimatedContributions(totRev, rate), totRest = C.round2(totRev - totExp - totCot);
    const nPresta = incomes.filter((x) => x.category === 'prestation').length, basket = incomes.length ? totRev / incomes.length : 0;
    const activeClients = new Set(incomes.filter((x) => x.client_id).map((x) => x.client_id));
    const newClients = Object.entries(firstVisit).filter(([, d]) => d >= from).length;
    /* fidélité : visites par cliente sur tout l'historique */
    const visitsBy = {}; for (const x of done) if (x.type === 'income' && x.client_id) (visitsBy[x.client_id] = visitsBy[x.client_id] || []).push(x.date);
    const withVisits = Object.values(visitsBy), returning = withVisits.filter((v) => v.length >= 2).length;
    const intervals = withVisits.flatMap((v) => { const d = [...v].sort(); return d.slice(1).map((x, i) => C.daysUntil(x, d[i])); });
    const avgInterval = intervals.length ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length) : null;
    /* jours de la semaine */
    const WD = Array.from({ length: 7 }, () => ({ rev: 0, count: 0 }));
    for (const x of incomes) { const d = new Date(x.date + 'T00:00:00Z'); const i = (d.getUTCDay() + 6) % 7; WD[i].rev += x.amount; WD[i].count++; }
    /* calendrier : 12 semaines jusqu'à dimanche */
    const w = C.weekBounds(t); const start = new Date(w.from + 'T00:00:00Z'); start.setUTCDate(start.getUTCDate() - 7 * 25);
    const days = []; for (let i = 0; i < 26 * 7; i++) { const d = new Date(start); d.setUTCDate(start.getUTCDate() + i); const key = d.toISOString().slice(0, 10); const list = done.filter((x) => x.type === 'income' && x.date === key); days.push({ key, value: sum(list), count: list.length, future: key > t, label: dayLabel(key) + ' ' + key.slice(0, 4), monthStart: (d.getUTCDate() <= 7 && (d.getUTCDay() + 6) % 7 === 0) || i === 0 ? fmtMonth(key.slice(0, 7)).replace('.', '') : null }); }
    /* répartitions */
    const byCat = {}; for (const x of expenses) byCat[x.category] = (byCat[x.category] || 0) + x.amount;
    const catGroups = Object.entries(byCat).map(([k, v]) => ({ label: TX_CAT[k] || k, amount: C.round2(v) })).sort((a, b) => b.amount - a.amount);
    const byType = {}; for (const x of incomes) byType[x.label.trim()] = (byType[x.label.trim()] || 0) + x.amount;
    const typeItems = Object.entries(byType).map(([label, value]) => ({ label, value: C.round2(value) })).sort((a, b) => b.value - a.value).slice(0, 8);
    const names = Object.fromEntries(clientsRes.items.map((c) => [c.id, c.display]));
    const perClient = {}; for (const x of incomes) if (x.client_id) { perClient[x.client_id] = perClient[x.client_id] || { total: 0, visits: 0 }; perClient[x.client_id].total += x.amount; perClient[x.client_id].visits++; }
    const topClients = Object.entries(perClient).map(([id, v]) => ({ label: names[id] || '?', value: C.round2(v.total), extra: `${v.visits} visite${v.visits > 1 ? 's' : ''}` })).sort((a, b) => b.value - a.value).slice(0, 6);
    /* records */
    const byDay = {}; for (const x of incomes) byDay[x.date] = (byDay[x.date] || 0) + x.amount;
    const bestDay = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
    const bestMonth = [...M].sort((a, b) => b.rev - a.rev)[0];
    const biggest = [...incomes].sort((a, b) => b.amount - a.amount)[0];
    const loyal = Object.entries(visitsBy).sort((a, b) => b[1].length - a[1].length)[0];
    const periodLabel = { '3m': 'Trois derniers mois', '6m': 'Six derniers mois', '12m': 'Douze derniers mois', year: `Année ${t.slice(0, 4)}`, all: 'Tout l\'historique' }[statState.period];
    const prevRange = (() => { const n = months.length; const prevMonths = []; let m = shiftMonth(months[0], -n); for (let i = 0; i < n; i++) { prevMonths.push(m); m = shiftMonth(m, 1); } return prevMonths; })();
    const prevInc = done.filter((x) => x.type === 'income' && x.date >= prevRange[0] + '-01' && x.date < from);
    const prevRev = sum(prevInc);
    const sp = (key, color) => CH.sparkline({ values: M.map((x) => x[key]), color });
    const tile = (k, v, spark, d = '') => `<div class="card poudre kpi stat"><div class="k">${k}</div><div class="v">${v}</div><div class="stat-foot">${d ? `<div class="d">${d}</div>` : '<span></span>'}${spark || ''}</div></div>`;
    view.innerHTML = `
      <div class="greet greet-row">
        <div><h2>${periodLabel}</h2><p>${months.length > 1 ? `${cap(monthLabel(months[0]))} – ${monthLabel(months[months.length - 1])}` : cap(monthLabel(months[0]))} · ${inP.length} opération${inP.length > 1 ? 's' : ''}</p></div>
        <select id="s-period" class="period-select" aria-label="Période">${[['3m', '3 mois'], ['6m', '6 mois'], ['12m', '12 mois'], ['year', 'Cette année'], ['all', 'Tout']].map(([k, l]) => `<option value="${k}" ${statState.period === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </div>
      <div class="kpis">
        ${tile("Chiffre d'affaires", fmtMoney(totRev), sp('rev', 'var(--or-deep)'), prevRev > 0 ? `<b>${C.pctChange(totRev, prevRev) > 0 ? '+' : ''}${C.pctChange(totRev, prevRev)} %</b> vs période précédente` : `${fmtMoney(months.length ? totRev / months.length : 0)} par mois`)}
        ${tile('Dépenses', fmtMoney(totExp), sp('ex', 'var(--laque)'), totRev > 0 ? `${Math.round((totExp / totRev) * 100)} % du CA` : '')}
        ${tile('Reste estimé', fmtMoney(totRest), sp('rest', 'var(--or-deep)'), totRev > 0 ? `marge ${Math.round((totRest / totRev) * 100)} %` : '')}
        ${tile('Cotisations estimées', fmtMoney(totCot), sp('cot', 'var(--sourdine-poudre)'), `${(rate * 100).toLocaleString('fr-FR')} % du CA`)}
        ${tile('Prestations', String(nPresta), sp('presta', 'var(--or-deep)'), months.length ? `${(nPresta / months.length).toFixed(1).replace('.', ',')} par mois` : '')}
        ${tile('Panier moyen', fmtMoney(basket), sp('basket', 'var(--or-deep)'), 'par encaissement')}
        ${tile('Clientes actives', String(activeClients.size), sp('newClients', 'var(--laque)'), `${newClients} nouvelle${newClients > 1 ? 's' : ''}`)}
        ${tile('Fidélité', withVisits.length ? `${Math.round((returning / withVisits.length) * 100)} %` : '—', sp('loyalPct', 'var(--laque)'), avgInterval ? `revient tous les ${avgInterval} j` : 'clientes revenues au moins une fois')}
      </div>

      <section class="card"><div class="card-head"><h3>Revenus, dépenses et reste par mois</h3><span class="legend" style="margin:0;font-size:.8rem"><span style="--c:var(--or)">CA</span><span style="--c:var(--laque)">Dépenses</span><span style="--c:var(--nacre-2)">Reste</span></span></div><div class="chart-slot" id="st-lines"></div></section>
      <div class="dash-grid">
        <section class="card"><div class="card-head"><h3>Objectif atteint, par mois</h3><span class="small muted">${goal > 0 ? `objectif ${fmtMoney(goal)}` : 'pas d\'objectif défini'}</span></div><div class="chart-slot" id="st-goal"></div></section>
        <section class="card"><div class="card-head"><h3>Cumul de la période</h3><span class="legend" style="margin:0;font-size:.8rem"><span style="--c:var(--or)">CA cumulé</span>${goal > 0 ? '<span style="--c:var(--nacre-2)">Rythme objectif</span>' : ''}</span></div><div class="chart-slot" id="st-cumul"></div></section>
        <section class="card"><div class="card-head"><h3>Prestations par mois</h3><span class="small muted">${nPresta} sur la période</span></div><div class="chart-slot" id="st-presta"></div></section>
        <section class="card"><div class="card-head"><h3>Panier moyen</h3><span class="small muted">par encaissement</span></div><div class="chart-slot" id="st-basket"></div></section>
        <section class="card"><div class="card-head"><h3>Tes meilleurs jours</h3><span class="small muted">CA par jour de la semaine</span></div><div class="chart-slot" id="st-wd"></div></section>
        <section class="card"><div class="card-head"><h3 id="st-heat-title">Les 12 dernières semaines</h3><span class="small muted">plus c'est doré, plus ça a rapporté</span></div><div class="chart-slot" id="st-heat"></div></section>
        <section class="card"><div class="card-head"><h3>Où va l'argent</h3><span class="small muted">${fmtMoney(totExp)} de dépenses</span></div>${catGroups.length ? `<div class="donut-wrap">${CH.donut({ groups: catGroups.slice(0, 5), total: totExp, colors: [...CH.PALETTE], center: fmtMoney(totExp), sub: 'dépensés' })}<div class="donut-legend">${catGroups.slice(0, 5).map((g, i) => `<div><i style="--c:${CH.PALETTE[i]}"></i><span>${esc(g.label)}</span><b>${Math.round((g.amount / totExp) * 100)} %<small>${fmtMoney(g.amount)}</small></b></div>`).join('')}</div></div>` : '<div class="empty"><strong>Aucune dépense sur la période.</strong></div>'}</section>
        <section class="card"><div class="card-head"><h3>Revenus par type</h3><span class="small muted">les 8 principaux</span></div>${typeItems.length ? `<div class="chart-slot" id="st-types"></div>` : '<div class="empty"><strong>Aucun revenu sur la période.</strong></div>'}</section>
        <section class="card"><div class="card-head"><h3>Nouvelles et fidèles</h3><span class="legend" style="margin:0;font-size:.8rem"><span style="--c:var(--laque)">Nouvelles</span><span style="--c:var(--or)">Fidèles</span></span></div><div class="chart-slot" id="st-clients"></div><p class="help" style="margin:4px 0 0">Visites par mois, selon que la cliente venait pour la première fois ou non.</p></section>
        <section class="card"><div class="card-head"><h3>Meilleures clientes</h3><a class="small" href="./app.html#clients">Clients</a></div>${topClients.length ? `<div class="chart-slot" id="st-top"></div>` : '<div class="empty"><strong>Rattache tes revenus à des clientes pour les voir ici.</strong></div>'}</section>
        <section class="card"><div class="card-head"><h3>Cotisations à provisionner</h3><span class="small muted">${fmtMoney(totCot)} sur la période</span></div><div class="chart-slot" id="st-cot"></div></section>
        <section class="card poudre"><div class="card-head"><h3>Records</h3></div><div class="list">
          <div class="item"><div class="main"><div class="title">Meilleur jour</div><div class="sub">${bestDay ? fmtDate(bestDay[0]) : '—'}</div></div><div class="amount income">${bestDay ? fmtMoney(bestDay[1]) : '—'}</div></div>
          <div class="item"><div class="main"><div class="title">Meilleur mois</div><div class="sub">${bestMonth && bestMonth.rev > 0 ? monthLabel(bestMonth.m) : '—'}</div></div><div class="amount income">${bestMonth && bestMonth.rev > 0 ? fmtMoney(bestMonth.rev) : '—'}</div></div>
          <div class="item"><div class="main"><div class="title">Plus grosse prestation</div><div class="sub">${biggest ? esc(biggest.label) + ', le ' + fmtDate(biggest.date) : '—'}</div></div><div class="amount income">${biggest ? fmtMoney(biggest.amount) : '—'}</div></div>
          <div class="item"><div class="main"><div class="title">Cliente la plus fidèle</div><div class="sub">${loyal ? esc(names[loyal[0]] || '?') : '—'}</div></div><div class="amount">${loyal ? loyal[1].length + ' visites' : '—'}</div></div>
        </div></section>
      </div>`;
    const slotW = (id) => Math.max(240, (qs('#' + id) || { clientWidth: 300 }).clientWidth);
    const sel = (k) => statState.sel[k] ?? null;
    statRedraws = [];
    const chart = (id, draw, interactive = true) => {
      const slot = qs('#' + id); if (!slot) return;
      const paint = () => { slot.innerHTML = draw(slotW(id)); if (interactive) CH.attach(slot, (i) => { if (statState.sel[id] === i) return; statState.sel[id] = i; paint(); }); };
      paint(); statRedraws.push(paint);
    };
    chart('st-lines', (W) => CH.lineChart({ W, labels, selected: sel('st-lines'), id: 'l1', series: [{ name: 'CA', values: M.map((x) => x.rev), color: 'var(--or)', area: true }, { name: 'Dépenses', values: M.map((x) => x.ex), color: 'var(--laque)' }, { name: 'Reste', values: M.map((x) => x.rest), color: 'var(--nacre-2)', dash: true, width: 1.8 }], zeroBase: false }));
    chart('st-goal', (W) => CH.barChart({ W, H: 200, labels, selected: sel('st-goal'), highlight: months.indexOf(nowYm), refLine: goal > 0 ? 100 : null, fmtV: (v) => Math.round(v) + ' %', fmtAxis: (v) => Math.round(v) + ' %', tipLines: (i) => [fmtMoney(M[i].rev)], series: [{ name: 'Objectif', values: M.map((x) => Math.round(x.goalPct)), color: 'var(--laque)' }] }));
    const cum = []; let acc = 0; M.forEach((x) => { acc += x.rev; cum.push(C.round2(acc)); });
    chart('st-cumul', (W) => CH.lineChart({ W, H: 200, labels, selected: sel('st-cumul'), id: 'l2', series: [{ name: 'CA cumulé', values: cum, color: 'var(--or)', area: true }, ...(goal > 0 ? [{ name: 'Objectif', values: M.map((_, i) => goal * (i + 1)), color: 'var(--nacre-2)', dash: true, width: 1.6 }] : [])] }));
    chart('st-presta', (W) => CH.barChart({ W, H: 200, labels, selected: sel('st-presta'), highlight: months.indexOf(nowYm), fmtV: (v) => String(v), fmtAxis: (v) => String(Math.round(v)), tipLines: (i) => [`${M[i].count} encaissement${M[i].count > 1 ? 's' : ''}`], series: [{ name: 'Prestations', values: M.map((x) => x.presta), color: 'var(--or)' }] }));
    chart('st-basket', (W) => CH.lineChart({ W, H: 200, labels, selected: sel('st-basket'), id: 'l3', series: [{ name: 'Panier moyen', values: M.map((x) => C.round2(x.basket)), color: 'var(--laque-2)', area: true }] }));
    chart('st-wd', (W) => CH.barChart({ W, H: 200, labels: DAYS_SHORT, selected: sel('st-wd'), highlight: (new Date(t + 'T00:00:00Z').getUTCDay() + 6) % 7, tipLines: (i) => [`${WD[i].count} encaissement${WD[i].count > 1 ? 's' : ''}`], series: [{ name: 'CA', values: WD.map((d) => C.round2(d.rev)), color: 'var(--or)' }] }));
    const heatSlot = qs('#st-heat'); let heatWeeks = 0;
    const paintHeat = () => { const W = slotW('st-heat'); const weeks = W >= 560 ? 26 : W >= 400 ? 16 : 12; if (weeks !== heatWeeks) { heatWeeks = weeks; statState.sel['st-heat'] = null; qs('#st-heat-title').textContent = `Les ${weeks} dernières semaines`; } const dd = days.slice(-weeks * 7); heatSlot.innerHTML = CH.heatmap({ W, days: dd, weeks, selected: sel('st-heat') }); CH.attachHeat(heatSlot, (i) => { if (statState.sel['st-heat'] === i) return; statState.sel['st-heat'] = i; paintHeat(); }); };
    paintHeat(); statRedraws.push(paintHeat);
    if (typeItems.length) chart('st-types', (W) => CH.hbars({ W, items: typeItems }), false);
    chart('st-clients', (W) => CH.barChart({ W, H: 200, labels, selected: sel('st-clients'), stacked: true, fmtV: (v) => String(v), series: [{ name: 'Nouvelles', values: M.map((x) => x.newVisits), color: 'var(--laque)' }, { name: 'Fidèles', values: M.map((x) => Math.max(0, x.oldVisits)), color: 'var(--or)' }] }));
    if (topClients.length) chart('st-top', (W) => CH.hbars({ W, items: topClients }), false);
    chart('st-cot', (W) => CH.barChart({ W, H: 180, labels, selected: sel('st-cot'), highlight: months.indexOf(nowYm), series: [{ name: 'Cotisations', values: M.map((x) => x.cot), color: 'var(--sourdine)' }] }));
    qs('#s-period').addEventListener('change', (e) => { statState.period = e.target.value; statState.sel = {}; renderStats(); });
  }
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (qs('#st-lines')) statRedraws.forEach((f) => f()); }, 150); });

  /* ---------- Vue : réglages ---------- */
  async function renderSettings() {
    const s = state.settings; const u = state.user;
    const pay = await api('/payment/status');
    view.innerHTML = `
      <form class="card poudre" id="profile-form">
        <div class="card-head"><h3>Profil</h3></div>
        ${STATIC ? '' : `<div class="field"><label>E-mail</label><input value="${esc(u.email)}" disabled></div>`}
        <div class="row"><div class="field"><label>Prénom</label><input name="name" maxlength="100" value="${esc(u.name || '')}" placeholder="Anaïs"></div><div class="field"><label>Nom de l'activité</label><input name="business_name" maxlength="100" value="${esc(u.business_name || '')}"></div></div>
        <div class="error" data-error></div><button class="btn btn-ghost btn-sm" type="submit">Enregistrer</button>
      </form>
      <div class="card poudre">
        <div class="card-head"><h3>Affichage</h3></div>
        <div class="segmented" id="mode-pick"><button type="button" data-mode-pick="nuit" class="${BBM.getMode() === 'nuit' ? 'active' : ''}">Nuit</button><button type="button" data-mode-pick="jour" class="${BBM.getMode() === 'jour' ? 'active' : ''}">Jour</button><button type="button" data-mode-pick="auto" class="${BBM.getMode() === 'auto' ? 'active' : ''}">Automatique</button></div>
        <p class="help" style="margin-top:8px">Automatique suit le réglage de ton téléphone.</p>
      </div>
      <form class="card" id="theme-form">
        <div class="card-head"><h3>Ton vernis</h3></div>
        <input type="hidden" name="theme" value="${s.theme}">
        <div class="swatches" style="margin-bottom:10px">${Object.entries(THEMES).map(([k, [n, c]]) => `<button type="button" class="swatch ${s.theme === k && !s.accent_color ? 'active' : ''}" data-theme="${k}" style="--c:${c}" title="${n}" aria-label="${n}"></button>`).join('')}</div>
        <div class="row" style="align-items:end"><div class="field"><label>Ou ta propre teinte</label><input name="accent_color" type="color" value="${s.accent_color || '#8a1f3a'}"></div><div class="field"><label style="display:flex;align-items:center;gap:8px;color:var(--nacre);min-height:46px"><input type="checkbox" name="use_custom" style="width:auto;min-height:0" ${s.accent_color ? 'checked' : ''}> Utiliser cette teinte</label></div></div>
        <div class="error" data-error></div><button class="btn btn-ghost btn-sm" type="submit">Appliquer</button>
      </form>
      <form class="card poudre" id="rate-form">
        <div class="card-head"><h3>Cotisations estimées</h3></div>
        <p class="notice" style="margin-bottom:12px">Le taux dépend de ta situation (ACRE, versement libératoire, activité). Vérifie-le auprès de l'Urssaf : l'application estime, elle ne déclare pas.</p>
        <div class="field"><label>Taux appliqué au chiffre d'affaires, %</label><input name="rate_pct" type="number" step="0.01" min="0" max="100" inputmode="decimal" value="${(s.contribution_rate * 100).toFixed(2)}"></div>
        <div class="field"><label>Note, par exemple la date de vérification</label><input name="contribution_note" maxlength="500" value="${esc(s.contribution_note || '')}"></div>
        <div class="error" data-error></div><button class="btn btn-ghost btn-sm" type="submit">Enregistrer</button>
      </form>
      <form class="card poudre ${STATIC ? 'hidden' : ''}" id="pwd-form">
        <div class="card-head"><h3>Mot de passe</h3></div>
        <div class="row"><div class="field"><label>Actuel</label><input name="current" type="password" autocomplete="current-password" required></div><div class="field"><label>Nouveau, 8 caractères au moins</label><input name="password" type="password" autocomplete="new-password" minlength="8" required></div></div>
        <div class="error" data-error></div><button class="btn btn-ghost btn-sm" type="submit">Changer le mot de passe</button>
      </form>
      <div class="card poudre ${STATIC ? 'hidden' : ''}">
        <div class="card-head"><h3>Accès</h3></div>
        <p class="small"><span class="tag ${pay.access_status === 'active' ? 'ok' : 'warn'}">${pay.access_status === 'active' ? 'Accès actif' : pay.access_status === 'pending' ? 'En attente de paiement' : 'Accès suspendu'}</span>${pay.free_access ? ' <span class="tag">accès libre, mode local</span>' : ''}</p>
        ${pay.payments.length ? `<div class="list">${pay.payments.map((p) => `<div class="item"><div class="main"><div class="title">${p.kind === 'initial' ? 'Accès initial' : p.kind === 'refund' ? 'Remboursement' : 'Abonnement'}</div><div class="sub">${p.created_at}, ${p.status}</div></div><div class="amount">${p.amount_cents != null ? fmtMoney(p.amount_cents / 100) : ''}</div></div>`).join('')}</div>` : ''}
        <a class="btn btn-ghost btn-sm" href="/acces" style="margin-top:8px">Voir mon accès</a>
      </div>
      <div class="card poudre">
        <div class="card-head"><h3>Tes données</h3></div>
        <p class="small muted">${STATIC ? 'Tes données restent dans ce navigateur, sur cet appareil. Exporte-les pour les sauvegarder ou les transférer.' : 'Exporte toutes tes opérations et abonnements, ou supprime définitivement le compte et tout ce qu\'il contient.'}</p>
        <div class="actions"><a class="btn btn-ghost btn-sm" href="/api/settings/export.csv">Exporter en CSV</a><a class="btn btn-ghost btn-sm" href="/api/settings/export.json">Exporter en JSON</a>${STATIC ? '<label class="btn btn-ghost btn-sm" style="margin:0">Importer un JSON<input type="file" id="import-json" accept="application/json" class="hidden"></label>' : ''}<button class="btn btn-danger btn-sm" id="del-account">${STATIC ? 'Tout effacer' : 'Supprimer mon compte'}</button></div>
      </div>
      <p class="small muted" style="margin:16px 0 0"><a href="./legal/mentions-legales.html">Mentions légales</a>, <a href="./legal/cgu.html">conditions d'utilisation</a>, <a href="./legal/cgv.html">conditions de vente</a>, <a href="./legal/confidentialite.html">confidentialité</a>, <a href="./support.html">support</a>.</p>`;

    const submit = (id, fn) => qs(id).addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target; qs('[data-error]', f).textContent = ''; try { await fn(Object.fromEntries(new FormData(f)), f); } catch (ex) { qs('[data-error]', f).textContent = ex.message; } });
    submit('#profile-form', async (d) => { await api('/settings/profile', { method: 'PUT', body: d }); Object.assign(state.user, d); setAvatar(); toast('Profil enregistré'); });
    submit('#rate-form', async (d) => { state.settings = await api('/settings/contributions', { method: 'PUT', body: { contribution_rate: Number(d.rate_pct) / 100, contribution_note: d.contribution_note } }); toast('Taux enregistré'); });
    submit('#theme-form', async (d) => { state.settings = await api('/settings/theme', { method: 'PUT', body: { theme: d.theme, accent_color: d.use_custom ? d.accent_color : '' } }); applyTheme(state.settings); toast('Vernis appliqué'); renderSettings(); });
    qs('#theme-form').querySelectorAll('.swatch').forEach((b) => b.addEventListener('click', () => {
      const f = qs('#theme-form'); f.theme.value = b.dataset.theme; f.use_custom.checked = false;
      f.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('active', x === b));
      applyTheme({ theme: b.dataset.theme, accent_color: null });
    }));
    submit('#pwd-form', async (d, f) => { await api('/auth/password', { method: 'POST', body: d }); f.reset(); toast('Mot de passe changé'); });
    const imp = qs('#import-json');
    if (imp) imp.addEventListener('change', async () => { if (!imp.files[0]) return; try { await BBM.local.importJson(imp.files[0]); toast('Données importées'); location.reload(); } catch (ex) { toast(ex.message); } });
    if (STATIC) { qs('#del-account').addEventListener('click', () => modal(`<h3>Tout effacer</h3><p class="muted small">Toutes les données de ce navigateur seront supprimées. Exporte-les avant si besoin.</p><div class="error" data-error></div>
      <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-close>Annuler</button><button class="btn btn-danger" type="submit">Effacer</button></div>`,
      async () => { await api('/settings/delete-account', { method: 'POST', body: {} }); location.reload(); })); return; }
    qs('#del-account').addEventListener('click', () => modal(`<h3>Supprimer le compte</h3><p class="muted small">Définitif : opérations, abonnements et réglages seront effacés. Exporte tes données avant si besoin.</p>
      <div class="field"><label>Ton mot de passe</label><input name="password" type="password" required></div><div class="error" data-error></div>
      <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-close>Annuler</button><button class="btn btn-danger" type="submit">Supprimer définitivement</button></div>`,
    async (d) => { await api('/settings/delete-account', { method: 'POST', body: d }); location.href = '/'; }));
  }

  /* ---------- Routeur ---------- */
  const routes = { '/app': renderDashboard, '/app/operations': renderOperations, '/app/journal': renderOperations, '/app/clients': renderClients, '/app/objectifs': renderGoals, '/app/rapports': renderReports, '/app/statistiques': renderStats, '/app/parametres': renderSettings, '/app/abonnements': renderSubscriptions };
  const STATIC = Boolean(BBM.STATIC);
  const currentPath = () => STATIC ? ('/app' + (location.hash.replace('#', '') ? '/' + location.hash.replace('#', '') : '')) : location.pathname;
  const setAvatar = () => { const a = qs('#avatar'); if (a) a.textContent = ((state.user && state.user.name) || 'B').trim().charAt(0).toUpperCase(); };
  async function navigate(path, push = true) {
    const client = path.match(/^\/app\/clients\/(\d+)$/);
    const base = client ? '/app/clients' : (routes[path] ? path : '/app');
    if (!client && !routes[path]) path = '/app';
    if (push) { if (STATIC) { const h = path.replace('/app', '').replace(/^\//, ''); if (location.hash.replace('#', '') !== h) { suppressHash = true; location.hash = h; } } else history.pushState({}, '', path); }
    document.querySelectorAll('a[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === (base === '/app/journal' ? '/app/operations' : base)));
    document.body.dataset.route = base;
    const title = qs('#page-title'); if (title) title.textContent = client ? 'Fiche cliente' : (TITLES[base] || 'Tableau de bord');
    document.title = `${client ? 'Fiche cliente' : (TITLES[base] || 'Mon espace')} — The Beauty Business Manager`;
    view.innerHTML = '<div class="empty">Chargement…</div>';
    try { if (client) await renderClient(Number(client[1])); else await routes[base](); window.scrollTo(0, 0); }
    catch (ex) {
      if (ex.status === 401) return location.replace('/connexion');
      if (ex.status === 402) return location.replace('/acces');
      if (ex.status === 404 && client) return navigate('/app/clients');
      view.innerHTML = `<p class="error">${esc(ex.message)}</p>`;
    }
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="/app"], a[href*="app.html"]'); if (!a || e.metaKey || e.ctrlKey) return;
    const href = a.getAttribute('href');
    const path = href.includes('app.html') ? '/app' + (href.split('#')[1] ? '/' + href.split('#')[1] : '') : href;
    e.preventDefault(); if (a.closest('.modal')) qs('#modal-root').innerHTML = ''; navigate(path);
  });
  let suppressHash = false;
  window.addEventListener('popstate', () => { if (!STATIC) navigate(location.pathname, false); });
  window.addEventListener('hashchange', () => { if (suppressHash) { suppressHash = false; return; } navigate(currentPath(), false); });
  const openAdd = () => txForm({}, () => navigate(currentPath(), false));
  qs('#fab').addEventListener('click', openAdd);
  const sideAdd = qs('#side-add'); if (sideAdd) sideAdd.addEventListener('click', openAdd);
  const more = qs('#tab-more'); if (more) more.addEventListener('click', moreSheet);
  document.addEventListener('click', async (e) => {
    const a = e.target.closest('a[href^="/api/settings/export"]'); if (!a || !STATIC) return;
    e.preventDefault(); const day = today();
    if (a.getAttribute('href').endsWith('.csv')) BBM.local.download(`bbm-export-${day}.csv`, BBM.local.exportCsv(), 'text/csv;charset=utf-8');
    else BBM.local.download(`bbm-export-${day}.json`, BBM.local.exportJson(), 'application/json');
  });

  (async () => {
    try {
      const me = await api('/auth/me');
      state.user = me.user; state.settings = me.settings; state.config = me.config;
      applyTheme(state.settings); setAvatar();
      if (state.user.access_status !== 'active') return location.replace('/acces');
      navigate(currentPath(), false);
    } catch { location.replace('/connexion'); }
  })();
})();
