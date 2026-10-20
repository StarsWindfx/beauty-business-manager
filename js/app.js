/* Application principale : routeur minimal + 5 vues. */
(() => {
  const { api, fmtMoney, fmtDate, fmtMonth, today, esc, applyTheme, toast, qs } = BBM;
  const view = qs('#view');
  const state = { user: null, settings: null, config: null };

  const TX_CAT = { prestation: 'Prestation', vente: 'Vente de produits', fournitures: 'Fournitures', materiel: 'Matériel', abonnement: 'Abonnement', loyer: 'Loyer, local', formation: 'Formation', marketing: 'Communication', transport: 'Déplacements', frais: 'Frais divers', autre: 'Autre' };
  const SUB_CAT = { logiciel: 'Logiciel', reservation: 'Prise de rendez-vous', reseaux: 'Réseaux sociaux', assurance: 'Assurance', banque: 'Banque', telephonie: 'Téléphone', formation: 'Formation', local: 'Local', autre: 'Autre' };
  const FREQ = { monthly: 'Chaque mois', quarterly: 'Chaque trimestre', yearly: 'Chaque année', weekly: 'Chaque semaine', custom: 'Tous les N mois' };
  const STATUS = { active: 'Actif', paused: 'En pause', canceled: 'Résilié' };
  const THEMES = { rose: ['Rose poudré', '#c4717f'], laque: ['Rouge laque', '#b3123f'], champagne: ['Champagne', '#b38a4e'], nude: ['Nude', '#a27a64'], prune: ['Prune', '#6d3b8f'] };
  const TITLES = { '/app': 'Tableau de bord', '/app/journal': 'Journal', '/app/abonnements': 'Abonnements', '/app/objectifs': 'Objectif', '/app/parametres': 'Réglages' };
  const options = (map, selected) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const ico = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const monthName = (d = new Date()) => d.toLocaleDateString('fr-FR', { month: 'long' });
  const deMonth = (d) => { const m = monthName(d); return (/^[aeiouy]/i.test(m) ? "d'" : 'de ') + m; };
  const pad = (n) => String(n).padStart(2, '0');
  const lastMonths = (n) => { const now = new Date(); const out = []; for (let i = n - 1; i >= 0; i--) { const x = new Date(now.getFullYear(), now.getMonth() - i, 1); out.push(`${x.getFullYear()}-${pad(x.getMonth() + 1)}`); } return out; };
  const isWide = () => window.matchMedia('(min-width: 600px)').matches;
  const dayLabel = (iso) => {
    const t = today(); if (iso === t) return "Aujourd'hui";
    const y = new Date(); y.setDate(y.getDate() - 1); if (iso === y.toISOString().slice(0, 10)) return 'Hier';
    const [yy, mm, dd] = iso.split('-'); const d = new Date(Date.UTC(yy, mm - 1, dd));
    const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

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
  const confirmDialog = (title, text) => new Promise((resolve) => {
    modal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>
      <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-close>Annuler</button><button class="btn btn-danger" type="submit">Supprimer</button></div>`,
    async () => resolve(true));
    qs('.modal').addEventListener('click', (e) => { if (e.target.classList.contains('modal') || e.target.closest('[data-close]')) resolve(false); });
  });
  function moreSheet() {
    modal(`<h3>Plus</h3>
      <div class="menu-list">
        <a href="./app.html#objectifs">${ico('goal')}Objectif</a>
        <a href="./app.html#parametres">${ico('settings')}Réglages</a>
        <button type="button" id="more-export">${ico('export')}Exporter mes données<small>JSON</small></button>
        <a href="./support.html">${ico('help')}Support</a>
        <a href="./index.html">${ico('site')}Site</a>
      </div>`, async () => {});
    qs('#more-export').addEventListener('click', () => { BBM.local.download(`bbm-export-${today()}.json`, BBM.local.exportJson(), 'application/json'); toast('Export téléchargé'); });
  }

  /* ---------- Formulaire opération ---------- */
  async function txForm(tx = {}, onDone) {
    const isEdit = Boolean(tx.id);
    const type = tx.type || 'income';
    let chips = '';
    if (!isEdit) {
      const all = (await api('/transactions')).items;
      const seen = new Set(); const recent = [];
      for (const t of all) { const k = t.type + '|' + t.label.toLowerCase(); if (seen.has(k)) continue; seen.add(k); recent.push(t); if (recent.length >= 8) break; }
      if (recent.length) chips = `<p class="chips-k">Saisie rapide</p><div class="chips">${recent.map((t) => `<button type="button" class="chip ${t.type === 'expense' ? 'out' : ''}" data-chip data-type="${t.type}" data-label="${esc(t.label)}" data-amount="${t.amount}" data-category="${t.category}">${esc(t.label)} <b>${fmtMoney(t.amount)}</b></button>`).join('')}</div>`;
    }
    const { form } = modal(`
      <h3>${isEdit ? 'Modifier l\'opération' : 'Nouvelle opération'}</h3>
      <div class="segmented" style="margin-bottom:14px">
        <button type="button" data-type="income" class="${type === 'income' ? 'active' : ''}">Encaissement</button>
        <button type="button" data-type="expense" class="${type === 'expense' ? 'active' : ''}">Dépense</button>
      </div>
      ${chips}
      <input type="hidden" name="type" value="${type}">
      <div class="field amount-field"><label>Montant, €</label><input name="amount" type="number" step="0.01" min="0" inputmode="decimal" required value="${tx.amount ?? ''}" placeholder="45" autofocus></div>
      <div class="field"><label>Libellé</label><input name="label" required maxlength="120" value="${esc(tx.label || '')}" placeholder="Pose gel complète" enterkeyhint="done"></div>
      <div class="row">
        <div class="field"><label>Date</label><input name="date" type="date" required value="${tx.date || today()}"></div>
        <div class="field"><label>Catégorie</label><select name="category">${options(TX_CAT, tx.category || (type === 'income' ? 'prestation' : 'fournitures'))}</select></div>
      </div>
      <div class="field"><label>Note</label><textarea name="note" rows="2" maxlength="1000">${esc(tx.note || '')}</textarea></div>
      <div class="error" data-error></div>
      <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-close>Annuler</button><button class="btn btn-primary" type="submit">${isEdit ? 'Enregistrer' : 'Ajouter'}</button></div>`,
    async (data) => {
      if (isEdit) await api(`/transactions/${tx.id}`, { method: 'PUT', body: data });
      else await api('/transactions', { method: 'POST', body: data });
      toast(isEdit ? 'Enregistré' : 'Ajouté');
      onDone && onDone();
    });
    const setType = (t) => {
      form.querySelectorAll('[data-type]').forEach((x) => x.classList.toggle('active', x.dataset.type === t));
      form.type.value = t;
      if (!isEdit) form.category.value = t === 'income' ? 'prestation' : 'fournitures';
    };
    form.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => setType(b.dataset.type)));
    form.querySelectorAll('[data-chip]').forEach((c) => c.addEventListener('click', () => {
      setType(c.dataset.type); form.label.value = c.dataset.label; form.amount.value = c.dataset.amount; form.category.value = c.dataset.category;
      qs('button[type=submit]', form).focus();
    }));
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

  /* ---------- Éléments de liste ---------- */
  const txItem = (t, actions = false) => `
    <div class="item" data-id="${t.id}">
      <div class="main"><div class="title">${esc(t.label)}</div><div class="sub">${esc(TX_CAT[t.category] || t.category)}${t.note ? '. ' + esc(t.note) : ''}</div></div>
      <div class="amount ${t.type}">${t.type === 'income' ? '+' : '−'}${fmtMoney(t.amount)}</div>
      ${actions ? `<div class="actions"><button class="icon-btn" data-del title="Supprimer" aria-label="Supprimer">${ico('del')}</button></div>` : ''}
    </div>`;

  /* ---------- Graphiques ---------- */
  const niceMax = (v) => { const p = Math.pow(10, Math.floor(Math.log10(Math.max(1, v)))); const f = v / p; const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10; return n * p; };
  const fmtK = (v) => v >= 1000 ? (v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k' : String(v);
  function barChart(hist, months, W) {
    const H = 200, padL = 38, padR = 8, padT = 30, padB = 24;
    const data = months.map((m) => hist.find((h) => h.month === m) || { month: m, revenue: 0, expenses: 0 });
    const max = niceMax(Math.max(1, ...data.map((d) => Math.max(d.revenue, d.expenses))));
    const innerW = W - padL - padR, slot = innerW / months.length, bw = Math.max(6, Math.min(18, slot * .3));
    const y = (v) => padT + (H - padT - padB) * (1 - v / max);
    const cur = months[months.length - 1];
    let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Encaissé et dépensé par mois"><defs>
      <linearGradient id="g-or" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--or-2)"/><stop offset="1" style="stop-color:var(--or)"/></linearGradient>
      <linearGradient id="g-laque" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--laque)"/><stop offset="1" style="stop-color:var(--laque-deep)"/></linearGradient></defs>`;
    [0, .5, 1].forEach((f) => { s += `<line class="grid-line" x1="${padL}" x2="${W - padR}" y1="${y(max * f)}" y2="${y(max * f)}"/><text x="${padL - 6}" y="${y(max * f) + 4}" text-anchor="end">${fmtK(max * f)}</text>`; });
    data.forEach((d, i) => {
      const cx = padL + slot * i + slot / 2;
      const rx = cx - bw - 1.5, ex = cx + 1.5;
      s += `<rect class="bar-r ${d.month === cur ? 'now' : ''}" x="${rx}" y="${y(d.revenue)}" width="${bw}" height="${Math.max(0, y(0) - y(d.revenue))}" rx="3"/>`;
      s += `<rect class="bar-e" x="${ex}" y="${y(d.expenses)}" width="${bw}" height="${Math.max(0, y(0) - y(d.expenses))}" rx="3"/>`;
      s += `<text x="${cx}" y="${H - 6}" text-anchor="middle">${fmtMonth(d.month)}</text>`;
      if (d.month === cur && d.revenue > 0) {
        const label = fmtMoney(d.revenue); const tw = label.length * 6.6 + 14; const tx = Math.min(W - padR - tw, Math.max(padL, cx - tw / 2)); const ty = Math.max(2, y(d.revenue) - 24);
        s += `<rect class="tip-bg" x="${tx}" y="${ty}" width="${tw}" height="18" rx="9"/><text class="tip-t" x="${tx + tw / 2}" y="${ty + 12.5}" text-anchor="middle">${label}</text>`;
      }
    });
    return s + '</svg>';
  }
  const DONUT_COLORS = ['var(--laque)', 'var(--laque-2)', 'color-mix(in srgb, var(--laque) 50%, var(--or))', 'var(--or)', 'var(--sourdine)'];
  function donut(groups, total) {
    const r = 52, c = 2 * Math.PI * r; let off = 0;
    const arcs = groups.map((g, i) => { const len = c * g.amount / total; const el = `<circle class="arc" cx="70" cy="70" r="${r}" style="stroke:${DONUT_COLORS[i]}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`; off += len; return el; }).join('');
    return `<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="Répartition des dépenses"><circle class="track" cx="70" cy="70" r="${r}"/>${arcs}<text class="center" x="70" y="68">${fmtMoney(total)}</text><text class="center-k" x="70" y="84">dépensés</text></svg>`;
  }
  const pctDelta = (cur, prev) => prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;
  const deltaHtml = (cur, prev, ref) => { const p = pctDelta(cur, prev); if (p === null) return `<div class="d">vs ${ref}</div>`; return `<div class="d ${p > 0 ? 'up' : p < 0 ? 'down' : ''}"><b>${p > 0 ? '+' : ''}${p} %</b> vs ${ref}</div>`; };

  /* ---------- Vue : tableau de bord ---------- */
  const dashState = { period: 'current', from: '', to: '' };
  let dashCharts = null;
  async function renderDashboard() {
    const q = new URLSearchParams({ period: dashState.period, from: dashState.from, to: dashState.to });
    const d = await api('/dashboard?' + q);
    const k = d.kpis;
    const prev = dashState.period === 'current' ? await api('/dashboard?period=previous') : null;
    const [inc, exp, prevInc] = await Promise.all([
      api(`/transactions?type=income&from=${d.period.from}&to=${d.period.to}`),
      api(`/transactions?type=expense&from=${d.period.from}&to=${d.period.to}`),
      prev ? api(`/transactions?type=income&from=${prev.period.from}&to=${prev.period.to}`) : null,
    ]);
    const rate = (k.contribution_rate * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    const pct = Math.min(100, d.goal.progress_pct);
    const base = k.revenue > 0 ? k.revenue : 1;
    const seg = (v) => k.revenue > 0 ? Math.max(0, Math.min(100, (v / base) * 100)) : 0;
    const prevRef = fmtMonth(lastMonths(2)[0]);
    const periodLabel = dashState.period === 'current' ? `Voici votre mois ${deMonth()}.` : dashState.period === 'previous' ? `Votre mois ${deMonth(new Date(new Date().setMonth(new Date().getMonth() - 1)))}.` : `Du ${fmtDate(d.period.from)} au ${fmtDate(d.period.to)}.`;
    const byCat = {}; for (const t of exp.items) byCat[t.category] = (byCat[t.category] || 0) + t.amount;
    let groups = Object.entries(byCat).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
    if (groups.length > 5) { const rest = groups.slice(4).reduce((s, g) => s + g.amount, 0); groups = [...groups.slice(0, 4), { category: 'autres', amount: rest, label: 'Autres' }]; }
    const expTotal = groups.reduce((s, g) => s + g.amount, 0);
    const name = state.user.name ? `, ${esc(state.user.name)}` : '';
    view.innerHTML = `
      <div class="greet greet-row">
        <div><h2>Bonjour${name} !</h2><p>${periodLabel}</p></div>
        <select id="period" class="period-select" aria-label="Période">
          <option value="current" ${dashState.period === 'current' ? 'selected' : ''}>Ce mois</option>
          <option value="previous" ${dashState.period === 'previous' ? 'selected' : ''}>Mois dernier</option>
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
        <p class="small muted" style="margin:12px 0 0">Encaissé − dépenses − cotisations estimées. Une estimation, pas un résultat comptable. <a href="./app.html#parametres">Changer le taux</a></p>
      </div></section>

      <div class="kpis">
        <div class="card poudre kpi main"><div class="k">Encaissé ${ico('in')}</div><div class="v">${fmtMoney(k.revenue)}</div>${prev ? deltaHtml(k.revenue, prev.kpis.revenue, prevRef) : ''}</div>
        <div class="card poudre kpi out"><div class="k">Dépenses ${ico('out')}</div><div class="v">${fmtMoney(k.expenses)}</div>${prev ? deltaHtml(k.expenses, prev.kpis.expenses, prevRef) : ''}</div>
        <div class="card poudre kpi"><div class="k">Cotisations ${ico('rest')}</div><div class="v">${fmtMoney(k.contributions)}</div><div class="d">${rate} % du chiffre d'affaires</div></div>
        <div class="card poudre kpi"><div class="k">Prestations ${ico('bottle')}</div><div class="v">${inc.total}</div>${prev ? deltaHtml(inc.total, prevInc.total, prevRef) : ''}</div>
      </div>

      <div class="two-col">
        <div>
          <section class="card">
            <div class="card-head"><h3>Encaissé par mois</h3><span class="legend" style="margin:0;font-size:.8rem"><span style="--c:var(--or)">Encaissé</span><span style="--c:var(--laque)">Dépensé</span></span></div>
            <div id="chart-bars"></div>
          </section>
          <section class="card">
            <div class="card-head"><h3>Où va l'argent</h3><a class="small" href="./app.html#journal">Journal</a></div>
            ${expTotal > 0 ? `<div class="donut-wrap">${donut(groups, expTotal)}<div class="donut-legend">${groups.map((g, i) => `<div><i style="--c:${DONUT_COLORS[i]}"></i><span>${esc(g.label || TX_CAT[g.category] || g.category)}</span><b>${fmtMoney(g.amount)}<small>${Math.round((g.amount / expTotal) * 100)} %</small></b></div>`).join('')}</div></div>` : '<div class="empty"><strong>Aucune dépense sur la période.</strong>La répartition apparaîtra ici.</div>'}
          </section>
        </div>
        <div>
          <section class="card poudre">
            <div class="card-head"><h3>Objectif ${deMonth()}</h3><a class="small" href="./app.html#objectifs">Modifier</a></div>
            ${d.goal.monthly_goal > 0 ? `
              <div class="progress"><span style="width:${pct}%"></span></div>
              <div style="display:flex;justify-content:space-between;margin-top:8px" class="small"><span>${fmtMoney(d.goal.achieved)} sur ${fmtMoney(d.goal.monthly_goal)}</span><span class="muted">${Math.round(d.goal.progress_pct)} %</span></div>
              ${d.goal.remaining_services !== null ? `<p style="margin:10px 0 0;font-family:var(--display);font-size:1.3rem">${d.goal.remaining_services === 0 ? 'Objectif atteint.' : `Encore ${d.goal.remaining_services} prestation${d.goal.remaining_services > 1 ? 's' : ''} à ${fmtMoney(d.goal.average_price)}.`}</p>` : '<p class="small muted" style="margin:8px 0 0">Indiquez un prix moyen pour compter les prestations restantes.</p>'}`
            : `<div class="empty"><strong>Pas encore d'objectif.</strong><a href="./app.html#objectifs">Définir un objectif mensuel</a></div>`}
          </section>
          <section class="card poudre">
            <div class="card-head"><h3>Prélèvements cette semaine</h3><a class="small" href="./app.html#abonnements">Abonnements</a></div>
            ${d.subscriptions.upcoming.length ? `<div class="list">${d.subscriptions.upcoming.map((s) => `
              <div class="item due-soon"><div class="main"><div class="title">${esc(s.name)}</div><div class="sub">${s.days_until < 0 ? `En retard de ${-s.days_until} jour${-s.days_until > 1 ? 's' : ''}` : s.days_until === 0 ? 'Aujourd\'hui' : s.days_until === 1 ? 'Demain' : `Dans ${s.days_until} jours`}, le ${fmtDate(s.next_charge_date)}</div></div><div class="amount expense">${fmtMoney(s.amount)}</div></div>`).join('')}</div>`
            : `<p class="muted small" style="margin:0">Aucun prélèvement dans les sept jours. Vos abonnements actifs : environ ${fmtMoney(d.subscriptions.monthly_cost)} par mois.</p>`}
          </section>
          <section class="card poudre">
            <div class="card-head"><h3>Dernières opérations</h3><a class="small" href="./app.html#journal">Journal</a></div>
            ${d.recent.length ? `<div class="list">${d.recent.map((t) => txItem(t)).join('')}</div>` : '<div class="empty"><strong>Rien de noté pour l\'instant.</strong>Ajoutez un encaissement ou une dépense avec le bouton +.</div>'}
          </section>
        </div>
      </div>`;
    const drawCharts = () => {
      const slot = qs('#chart-bars'); if (!slot) return;
      const W = Math.max(260, slot.clientWidth);
      slot.innerHTML = barChart(d.history, lastMonths(isWide() ? 12 : 6), W);
    };
    drawCharts(); dashCharts = drawCharts;
    requestAnimationFrame(() => {
      const segs = view.querySelectorAll('.lacquer > span');
      [k.expenses, k.contributions, Math.max(0, k.remaining)].forEach((v, i) => { segs[i].style.width = seg(v) + '%'; });
    });
    qs('#period').addEventListener('change', (e) => { dashState.period = e.target.value; if (dashState.period !== 'custom') renderDashboard(); else qs('#custom-range').classList.remove('hidden'); });
    ['from', 'to'].forEach((id) => qs('#' + id).addEventListener('change', () => { dashState.from = qs('#from').value; dashState.to = qs('#to').value; if (dashState.from && dashState.to) renderDashboard(); }));
  }
  let resizeT; window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (dashCharts && qs('#chart-bars')) dashCharts(); }, 150); });

  /* ---------- Vue : journal ---------- */
  const jState = { type: '', category: '', from: '', to: '', q: '', filtersOpen: false };
  async function renderJournal() {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(jState).filter(([key, v]) => v && key !== 'filtersOpen')));
    const d = await api('/transactions?' + q);
    const inc = d.items.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = d.items.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const hasFilters = Boolean(jState.type || jState.category || jState.from || jState.to);
    const open = jState.filtersOpen || hasFilters;
    const byDay = []; for (const t of d.items) { const last = byDay[byDay.length - 1]; if (last && last.date === t.date) last.items.push(t); else byDay.push({ date: t.date, items: [t] }); }
    view.innerHTML = `
      <div class="row" style="grid-template-columns:1fr auto;margin-bottom:12px;align-items:center">
        <div class="search">${ico('search')}<input id="f-q" placeholder="Rechercher" value="${esc(jState.q)}" enterkeyhint="search"></div>
        <button class="btn btn-ghost filters-toggle" id="f-toggle" aria-expanded="${open}">${ico('filter')}Filtres${hasFilters ? ' •' : ''}</button>
      </div>
      <div class="card ${open ? '' : 'hidden'}" id="filters" style="margin-bottom:14px">
        <div class="row">
          <div><label>Type</label><select id="f-type"><option value="">Tout</option><option value="income" ${jState.type === 'income' ? 'selected' : ''}>Encaissements</option><option value="expense" ${jState.type === 'expense' ? 'selected' : ''}>Dépenses</option></select></div>
          <div><label>Catégorie</label><select id="f-cat"><option value="">Toutes</option>${options(TX_CAT, jState.category)}</select></div>
          <div><label>Du</label><input type="date" id="f-from" value="${jState.from}"></div>
          <div><label>Au</label><input type="date" id="f-to" value="${jState.to}"></div>
        </div>
        ${hasFilters ? '<button class="btn btn-ghost btn-sm" id="f-clear" style="margin-top:12px">Effacer les filtres</button>' : ''}
      </div>
      <div class="figures">
        <div class="card poudre figure in"><div class="k">Encaissé</div><div class="v">${fmtMoney(inc)}</div></div>
        <div class="card poudre figure out"><div class="k">Dépensé</div><div class="v">${fmtMoney(exp)}</div></div>
      </div>
      <section class="card poudre">
        <div class="card-head"><h3>${d.total} opération${d.total > 1 ? 's' : ''}</h3><button class="btn btn-ghost btn-sm" id="add">${ico('plus')}Ajouter</button></div>
        ${d.items.length ? `<div class="list" id="tx-list">${byDay.map((g) => `<div class="day-head"><span>${dayLabel(g.date)}</span><span>${fmtDate(g.date)}</span></div>${g.items.map((t) => txItem(t, true)).join('')}`).join('')}</div>` : '<div class="empty"><strong>Aucune opération ici.</strong>Changez les filtres ou ajoutez une opération avec le bouton +.</div>'}
      </section>`;
    const refresh = () => renderJournal();
    qs('#add').addEventListener('click', () => txForm({}, refresh));
    qs('#f-toggle').addEventListener('click', () => { jState.filtersOpen = !open; qs('#filters').classList.toggle('hidden', !jState.filtersOpen && !hasFilters); qs('#f-toggle').setAttribute('aria-expanded', String(jState.filtersOpen || hasFilters)); });
    const bind = (id, key) => qs(id).addEventListener('change', (e) => { jState[key] = e.target.value; jState.filtersOpen = true; refresh(); });
    bind('#f-type', 'type'); bind('#f-cat', 'category'); bind('#f-from', 'from'); bind('#f-to', 'to');
    const clear = qs('#f-clear'); if (clear) clear.addEventListener('click', () => { Object.assign(jState, { type: '', category: '', from: '', to: '', filtersOpen: false }); refresh(); });
    let t; qs('#f-q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { jState.q = e.target.value; refresh(); }, 350); });
    const list = qs('#tx-list');
    if (list) list.addEventListener('click', async (e) => {
      const item = e.target.closest('.item'); if (!item) return;
      const tx = d.items.find((x) => x.id === Number(item.dataset.id));
      if (e.target.closest('[data-del]')) {
        if (await confirmDialog('Supprimer cette opération ?', `${tx.label}, ${fmtMoney(tx.amount)}. Les totaux seront recalculés.`)) { await api(`/transactions/${tx.id}`, { method: 'DELETE' }); toast('Supprimé'); refresh(); }
        return;
      }
      txForm(tx, refresh);
    });
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
        <p class="small muted" style="margin:0 0 6px">La coche confirme un prélèvement : il passe dans le journal et l'échéance avance. Touchez une ligne pour la modifier.</p>
        ${d.items.length ? `<div class="list" id="sub-list">${d.items.map(subItem).join('')}</div>` : `<div class="empty"><strong>Aucun abonnement.</strong>Prise de rendez-vous, logiciels, assurance, banque : ajoutez-les pour voir ce qu'ils coûtent vraiment et quand ils tombent.</div>`}
      </section>`;
    const refresh = () => renderSubscriptions();
    qs('#add').addEventListener('click', () => subForm({}, refresh));
    const list = qs('#sub-list');
    if (list) list.addEventListener('click', async (e) => {
      const item = e.target.closest('.item'); if (!item) return;
      const s = d.items.find((x) => x.id === Number(item.dataset.id));
      if (e.target.closest('[data-confirm]')) {
        modal(`<h3>Confirmer le prélèvement</h3><p class="muted small">Une dépense « ${esc(s.name)} » est ajoutée au journal et la prochaine échéance avance d'une période.</p>
          <div class="row"><div class="field"><label>Montant, €</label><input name="amount" type="number" step="0.01" min="0" inputmode="decimal" value="${s.amount}"></div><div class="field"><label>Date du prélèvement</label><input name="date" type="date" value="${s.next_charge_date}"></div></div>
          <div class="error" data-error></div>
          <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-close>Annuler</button><button class="btn btn-primary" type="submit">Confirmer</button></div>`,
        async (data) => { await api(`/subscriptions/${s.id}/confirm`, { method: 'POST', body: data }); toast('Prélèvement ajouté au journal'); refresh(); });
        return;
      }
      if (e.target.closest('[data-del]')) {
        if (await confirmDialog('Supprimer cet abonnement ?', `${s.name}. Les prélèvements déjà confirmés restent dans le journal.`)) { await api(`/subscriptions/${s.id}`, { method: 'DELETE' }); toast('Supprimé'); refresh(); }
        return;
      }
      subForm(s, refresh);
    });
  }

  /* ---------- Vue : objectif ---------- */
  async function renderGoals() {
    const d = await api('/dashboard');
    const s = state.settings;
    const pct = Math.min(100, d.goal.progress_pct);
    view.innerHTML = `
      <div class="two-col">
        <form class="card poudre" id="goal-form">
          <div class="card-head"><h3>Votre objectif</h3></div>
          <div class="field"><label>Chiffre d'affaires visé par mois, €</label><input name="monthly_goal" type="number" step="0.01" min="0" inputmode="decimal" value="${s.monthly_goal || ''}" placeholder="3000"></div>
          <div class="field"><label>Prix moyen d'une prestation, €</label><input name="average_price" type="number" step="0.01" min="0" inputmode="decimal" value="${s.average_price || ''}" placeholder="45"></div>
          <div class="error" data-error></div>
          <button class="btn btn-primary" type="submit">Enregistrer</button>
        </form>
        <section class="card ecrin" style="margin-bottom:0">
          <div class="card-head"><h3>${monthName().charAt(0).toUpperCase() + monthName().slice(1)}</h3></div>
          ${s.monthly_goal > 0 ? `
            <div class="hero-figure"><div class="value num" style="font-size:2.8rem">${fmtMoney(d.goal.achieved)}</div><p class="muted small">sur ${fmtMoney(s.monthly_goal)}, ${Math.round(d.goal.progress_pct)} %</p></div>
            <div class="progress"><span style="width:${pct}%"></span></div>
            <p style="margin-top:14px;font-family:var(--display);font-size:1.3rem">${d.goal.remaining_services === null ? '<span class="muted small" style="font-family:var(--ui)">Indiquez un prix moyen pour compter les prestations restantes.</span>' : d.goal.remaining_services === 0 ? 'Objectif atteint.' : `Encore ${d.goal.remaining_services} prestation${d.goal.remaining_services > 1 ? 's' : ''} à ${fmtMoney(s.average_price)}.`}</p>
            <p class="small muted" style="margin:0">Arrondi au-dessus de (objectif − encaissé) ÷ prix moyen.</p>`
          : '<div class="empty"><strong>Pas encore d\'objectif.</strong>Renseignez-le pour suivre le mois.</div>'}
        </section>
      </div>`;
    qs('#goal-form').addEventListener('submit', async (e) => {
      e.preventDefault(); const f = e.target;
      try { state.settings = await api('/settings/goals', { method: 'PUT', body: Object.fromEntries(new FormData(f)) }); toast('Enregistré'); renderGoals(); }
      catch (ex) { qs('[data-error]', f).textContent = ex.message; }
    });
  }

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
      <form class="card" id="theme-form">
        <div class="card-head"><h3>Votre vernis</h3></div>
        <input type="hidden" name="theme" value="${s.theme}">
        <div class="swatches" style="margin-bottom:10px">${Object.entries(THEMES).map(([k, [n, c]]) => `<button type="button" class="swatch ${s.theme === k && !s.accent_color ? 'active' : ''}" data-theme="${k}" style="--c:${c}" title="${n}" aria-label="${n}"></button>`).join('')}</div>
        <div class="row" style="align-items:end"><div class="field"><label>Ou votre propre teinte</label><input name="accent_color" type="color" value="${s.accent_color || '#c4717f'}"></div><div class="field"><label style="display:flex;align-items:center;gap:8px;color:var(--nacre);min-height:46px"><input type="checkbox" name="use_custom" style="width:auto;min-height:0" ${s.accent_color ? 'checked' : ''}> Utiliser cette teinte</label></div></div>
        <div class="error" data-error></div><button class="btn btn-ghost btn-sm" type="submit">Appliquer</button>
      </form>
      <form class="card poudre" id="rate-form">
        <div class="card-head"><h3>Cotisations estimées</h3></div>
        <p class="notice" style="margin-bottom:12px">Le taux dépend de votre situation (ACRE, versement libératoire, activité). Vérifiez-le auprès de l'Urssaf : l'application estime, elle ne déclare pas.</p>
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
        <div class="card-head"><h3>Vos données</h3></div>
        <p class="small muted">${STATIC ? 'Vos données restent dans ce navigateur, sur cet appareil. Exportez-les pour les sauvegarder ou les transférer.' : 'Exportez toutes vos opérations et abonnements, ou supprimez définitivement le compte et tout ce qu\'il contient.'}</p>
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
    if (STATIC) { qs('#del-account').addEventListener('click', () => modal(`<h3>Tout effacer</h3><p class="muted small">Toutes les données de ce navigateur seront supprimées. Exportez-les avant si besoin.</p><div class="error" data-error></div>
      <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-close>Annuler</button><button class="btn btn-danger" type="submit">Effacer</button></div>`,
      async () => { await api('/settings/delete-account', { method: 'POST', body: {} }); location.reload(); })); return; }
    qs('#del-account').addEventListener('click', () => modal(`<h3>Supprimer le compte</h3><p class="muted small">Définitif : opérations, abonnements et réglages seront effacés. Exportez vos données avant si besoin.</p>
      <div class="field"><label>Votre mot de passe</label><input name="password" type="password" required></div><div class="error" data-error></div>
      <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" type="button" data-close>Annuler</button><button class="btn btn-danger" type="submit">Supprimer définitivement</button></div>`,
    async (d) => { await api('/settings/delete-account', { method: 'POST', body: d }); location.href = '/'; }));
  }

  /* ---------- Routeur ---------- */
  const routes = { '/app': renderDashboard, '/app/journal': renderJournal, '/app/abonnements': renderSubscriptions, '/app/objectifs': renderGoals, '/app/parametres': renderSettings };
  const STATIC = Boolean(BBM.STATIC);
  const currentPath = () => STATIC ? ('/app' + (location.hash.replace('#', '') ? '/' + location.hash.replace('#', '') : '')) : location.pathname;
  const setAvatar = () => { const a = qs('#avatar'); if (a) a.textContent = ((state.user && state.user.name) || 'B').trim().charAt(0).toUpperCase(); };
  async function navigate(path, push = true) {
    const fn = routes[path] || routes['/app'];
    if (!routes[path]) path = '/app';
    if (push) { if (STATIC) { const h = path.replace('/app', '').replace(/^\//, ''); if (location.hash.replace('#', '') !== h) { suppressHash = true; location.hash = h; } } else history.pushState({}, '', path); }
    document.querySelectorAll('a[data-route]').forEach((a) => a.classList.toggle('active', a.dataset.route === path));
    document.body.dataset.route = path;
    const title = qs('#page-title'); if (title) title.textContent = TITLES[path] || 'Tableau de bord';
    document.title = `${TITLES[path] || 'Mon espace'} — The Beauty Business Manager`;
    view.innerHTML = '<div class="empty">Chargement…</div>';
    try { await fn(); window.scrollTo(0, 0); }
    catch (ex) {
      if (ex.status === 401) return location.replace('/connexion');
      if (ex.status === 402) return location.replace('/acces');
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
