/* Application principale : routeur minimal + 5 vues. */
(() => {
  const { api, fmtMoney, fmtDate, fmtMonth, today, esc, applyTheme, toast, qs } = BBM;
  const view = qs('#view');
  const state = { user: null, settings: null, config: null };

  const TX_CAT = { prestation: 'Prestation', vente: 'Vente de produits', fournitures: 'Fournitures', materiel: 'Matériel', abonnement: 'Abonnement', loyer: 'Loyer, local', formation: 'Formation', marketing: 'Communication', transport: 'Déplacements', frais: 'Frais divers', autre: 'Autre' };
  const SUB_CAT = { logiciel: 'Logiciel', reservation: 'Prise de rendez-vous', reseaux: 'Réseaux sociaux', assurance: 'Assurance', banque: 'Banque', telephonie: 'Téléphone', formation: 'Formation', local: 'Local', autre: 'Autre' };
  const FREQ = { monthly: 'Chaque mois', quarterly: 'Chaque trimestre', yearly: 'Chaque année', weekly: 'Chaque semaine', custom: 'Tous les N mois' };
  const STATUS = { active: 'Actif', paused: 'En pause', canceled: 'Résilié' };
  const THEMES = { laque: ['Rouge laque', '#b3123f'], rose: ['Rose poudré', '#c24f7e'], champagne: ['Champagne', '#b38a4e'], nude: ['Nude', '#a27a64'], prune: ['Prune', '#6d3b8f'] };
  const options = (map, selected) => Object.entries(map).map(([k, v]) => `<option value="${k}" ${k === selected ? 'selected' : ''}>${esc(v)}</option>`).join('');
  const ICON = {
    edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4l10-10-4-4L4 16v4zM13 7l4 4"/></svg>',
    del: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4L19 6"/></svg>',
  };
  const monthName = (d = new Date()) => d.toLocaleDateString('fr-FR', { month: 'long' });
  const deMonth = (d) => { const m = monthName(d); return (/^[aeiouy]/i.test(m) ? "d'" : 'de ') + m; };

  /* ---------- Modale ---------- */
  function modal(html, onSubmit) {
    const root = qs('#modal-root');
    root.innerHTML = `<div class="modal"><form class="sheet">${html}</form></div>`;
    const form = qs('form', root);
    const close = () => { root.innerHTML = ''; };
    qs('.modal', root).addEventListener('click', (e) => { if (e.target.classList.contains('modal')) close(); });
    form.addEventListener('click', (e) => { if (e.target.dataset.close !== undefined) { e.preventDefault(); close(); } });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = qs('[data-error]', form); if (err) err.textContent = '';
      const btn = qs('button[type=submit]', form); if (btn) btn.disabled = true;
      try { await onSubmit(Object.fromEntries(new FormData(form).entries()), form); close(); }
      catch (ex) { if (err) err.textContent = ex.message; else toast(ex.message); }
      finally { if (btn) btn.disabled = false; }
    });
    qs('input:not([type=hidden]), select', form)?.focus();
    return { form, close };
  }
  const confirmDialog = (title, text) => new Promise((resolve) => {
    modal(`<h3>${esc(title)}</h3><p class="muted">${esc(text)}</p>
      <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-danger" type="submit">Supprimer</button></div>`,
    async () => resolve(true));
    qs('.modal').addEventListener('click', (e) => { if (e.target.classList.contains('modal') || e.target.dataset.close !== undefined) resolve(false); });
  });

  /* ---------- Formulaire opération ---------- */
  function txForm(tx = {}, onDone) {
    const isEdit = Boolean(tx.id);
    const type = tx.type || 'income';
    const { form } = modal(`
      <h3>${isEdit ? 'Modifier l\'opération' : 'Nouvelle opération'}</h3>
      <div class="segmented" style="margin-bottom:14px">
        <button type="button" data-type="income" class="${type === 'income' ? 'active' : ''}">Encaissement</button>
        <button type="button" data-type="expense" class="${type === 'expense' ? 'active' : ''}">Dépense</button>
      </div>
      <input type="hidden" name="type" value="${type}">
      <div class="field"><label>Libellé</label><input name="label" required maxlength="120" value="${esc(tx.label || '')}" placeholder="Pose gel complète"></div>
      <div class="row">
        <div class="field"><label>Montant, €</label><input name="amount" type="number" step="0.01" min="0" inputmode="decimal" required value="${tx.amount ?? ''}"></div>
        <div class="field"><label>Date</label><input name="date" type="date" required value="${tx.date || today()}"></div>
      </div>
      <div class="field"><label>Catégorie</label><select name="category">${options(TX_CAT, tx.category || (type === 'income' ? 'prestation' : 'fournitures'))}</select></div>
      <div class="field"><label>Note</label><textarea name="note" rows="2" maxlength="1000">${esc(tx.note || '')}</textarea></div>
      <div class="error" data-error></div>
      <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-primary" type="submit">${isEdit ? 'Enregistrer' : 'Ajouter'}</button></div>`,
    async (data) => {
      if (isEdit) await api(`/transactions/${tx.id}`, { method: 'PUT', body: data });
      else await api('/transactions', { method: 'POST', body: data });
      toast(isEdit ? 'Enregistré' : 'Ajouté');
      onDone && onDone();
    });
    form.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
      form.querySelectorAll('[data-type]').forEach((x) => x.classList.remove('active'));
      b.classList.add('active'); form.type.value = b.dataset.type;
      if (!isEdit) form.category.value = b.dataset.type === 'income' ? 'prestation' : 'fournitures';
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
      <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-primary" type="submit">${isEdit ? 'Enregistrer' : 'Ajouter'}</button></div>`,
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
      <div class="main"><div class="title">${esc(t.label)}</div><div class="sub">${fmtDate(t.date)}, ${esc(TX_CAT[t.category] || t.category)}${t.note ? '. ' + esc(t.note) : ''}</div></div>
      <div class="amount ${t.type}">${t.type === 'income' ? '+' : '−'}${fmtMoney(t.amount)}</div>
      ${actions ? `<div class="actions"><button class="icon-btn" data-edit title="Modifier">${ICON.edit}</button><button class="icon-btn" data-del title="Supprimer">${ICON.del}</button></div>` : ''}
    </div>`;

  /* ---------- Vue : ce mois ---------- */
  const dashState = { period: 'current', from: '', to: '' };
  async function renderDashboard() {
    const q = new URLSearchParams({ period: dashState.period, from: dashState.from, to: dashState.to });
    const d = await api('/dashboard?' + q);
    const k = d.kpis;
    const rate = (k.contribution_rate * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    const pct = Math.min(100, d.goal.progress_pct);
    const base = k.revenue > 0 ? k.revenue : 1;
    const seg = (v) => k.revenue > 0 ? Math.max(0, Math.min(100, (v / base) * 100)) : 0;
    const periodLabel = dashState.period === 'current' ? monthName() : dashState.period === 'previous' ? monthName(new Date(new Date().setMonth(new Date().getMonth() - 1))) : `${fmtDate(d.period.from)} au ${fmtDate(d.period.to)}`;
    view.innerHTML = `
      <div class="sheet-head"><h2>${state.user.name ? esc(state.user.name) + ', ' : ''}${periodLabel}</h2>
        <select id="period" style="width:auto;min-height:36px;padding:.3em 1.8em .3em .7em;font-size:.9rem">
          <option value="current" ${dashState.period === 'current' ? 'selected' : ''}>Ce mois</option>
          <option value="previous" ${dashState.period === 'previous' ? 'selected' : ''}>Mois dernier</option>
          <option value="custom" ${dashState.period === 'custom' ? 'selected' : ''}>Autre période</option>
        </select></div>
      <div class="row ${dashState.period === 'custom' ? '' : 'hidden'}" id="custom-range" style="margin-bottom:12px">
        <div><label>Du</label><input type="date" id="from" value="${dashState.from}"></div><div><label>Au</label><input type="date" id="to" value="${dashState.to}"></div>
      </div>

      <div class="hero-figure">
        <p class="lede">Reste estimé</p>
        <div class="value num ${k.remaining < 0 ? 'negative' : ''}">${fmtMoney(k.remaining)}</div>
        <div class="lacquer"><span class="seg-dep" style="width:0"></span><span class="seg-cot" style="width:0"></span><span class="seg-reste" style="width:0"></span></div>
        <div class="legend">
          <span style="--c:var(--laque)">Dépenses <b>${fmtMoney(k.expenses)}</b></span>
          <span style="--c:color-mix(in srgb, var(--laque) 45%, var(--encre))">Cotisations ${rate} % <b>${fmtMoney(k.contributions)}</b></span>
          <span style="--c:var(--or)">Reste <b>${fmtMoney(Math.max(0, k.remaining))}</b></span>
        </div>
        <p class="small muted" style="margin:12px 0 0">Sur <b style="color:var(--or-2);font-weight:500">${fmtMoney(k.revenue)}</b> encaissés. Reste = encaissé − dépenses − cotisations estimées ; c'est une estimation, pas un résultat comptable. <a href="/app/parametres">Changer le taux</a></p>
      </div>

      <div class="two-col">
        <div>
          <div class="bloc">
            <div class="sheet-head"><h3>Objectif ${deMonth()}</h3><a class="small" href="/app/objectifs">Modifier</a></div>
            ${d.goal.monthly_goal > 0 ? `
              <div class="progress"><span style="width:${pct}%"></span></div>
              <div style="display:flex;justify-content:space-between;margin-top:8px" class="small"><span>${fmtMoney(d.goal.achieved)} sur ${fmtMoney(d.goal.monthly_goal)}</span><span class="muted">${d.goal.progress_pct} %</span></div>
              ${d.goal.remaining_services !== null ? `<p style="margin:10px 0 0;font-family:var(--display);font-size:1.3rem">${d.goal.remaining_services === 0 ? 'Objectif atteint.' : `Encore ${d.goal.remaining_services} prestation${d.goal.remaining_services > 1 ? 's' : ''} à ${fmtMoney(d.goal.average_price)}.`}</p>` : '<p class="small muted" style="margin-top:8px">Indiquez un prix moyen pour compter les prestations restantes.</p>'}`
            : `<div class="empty"><strong>Pas encore d'objectif.</strong><a href="/app/objectifs">Définir un objectif mensuel</a></div>`}
          </div>
          <div class="bloc">
            <div class="sheet-head"><h3>Six derniers mois</h3><span class="legend" style="margin:0"><span style="--c:var(--or)">Encaissé</span><span style="--c:var(--laque)">Dépensé</span></span></div>
            ${renderBars(d.history)}
          </div>
        </div>
        <div>
          <div class="bloc">
            <div class="sheet-head"><h3>Prélèvements cette semaine</h3><a class="small" href="/app/abonnements">Abonnements</a></div>
            ${d.subscriptions.upcoming.length ? `<div class="list">${d.subscriptions.upcoming.map((s) => `
              <div class="item due-soon"><div class="main"><div class="title">${esc(s.name)}</div><div class="sub">${s.days_until < 0 ? `En retard de ${-s.days_until} jour${-s.days_until > 1 ? 's' : ''}` : s.days_until === 0 ? 'Aujourd\'hui' : s.days_until === 1 ? 'Demain' : `Dans ${s.days_until} jours`}, le ${fmtDate(s.next_charge_date)}</div></div><div class="amount expense">${fmtMoney(s.amount)}</div></div>`).join('')}</div>`
            : `<p class="muted small">Aucun prélèvement prévu dans les sept jours. Vos abonnements actifs coûtent environ ${fmtMoney(d.subscriptions.monthly_cost)} par mois.</p>`}
          </div>
          <div class="bloc">
            <div class="sheet-head"><h3>Dernières opérations</h3><a class="small" href="/app/journal">Journal</a></div>
            ${d.recent.length ? `<div class="list">${d.recent.map((t) => txItem(t)).join('')}</div>` : '<div class="empty"><strong>Rien de noté pour l\'instant.</strong>Ajoutez un encaissement ou une dépense avec le bouton +.</div>'}
          </div>
        </div>
      </div>`;
    requestAnimationFrame(() => {
      const segs = view.querySelectorAll('.lacquer > span');
      [k.expenses, k.contributions, Math.max(0, k.remaining)].forEach((v, i) => { segs[i].style.width = seg(v) + '%'; });
    });
    qs('#period').addEventListener('change', (e) => { dashState.period = e.target.value; if (dashState.period !== 'custom') renderDashboard(); else qs('#custom-range').classList.remove('hidden'); });
    ['from', 'to'].forEach((id) => qs('#' + id).addEventListener('change', () => { dashState.from = qs('#from').value; dashState.to = qs('#to').value; if (dashState.from && dashState.to) renderDashboard(); }));
  }
  function renderBars(history) {
    if (!history.length) return '<p class="muted small">Les mois apparaîtront ici au fil de vos saisies.</p>';
    const max = Math.max(...history.map((h) => Math.max(h.revenue, h.expenses)), 1);
    return `<div class="bars">${history.map((h) => `<div class="bar"><div class="cols"><div class="col r" style="height:${(h.revenue / max) * 100}%" title="Encaissé ${fmtMoney(h.revenue)}"></div><div class="col e" style="height:${(h.expenses / max) * 100}%" title="Dépensé ${fmtMoney(h.expenses)}"></div></div><div class="lbl">${fmtMonth(h.month)}</div></div>`).join('')}</div>`;
  }

  /* ---------- Vue : journal ---------- */
  const jState = { type: '', category: '', from: '', to: '', q: '' };
  async function renderJournal() {
    const q = new URLSearchParams(Object.fromEntries(Object.entries(jState).filter(([, v]) => v)));
    const d = await api('/transactions?' + q);
    const inc = d.items.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const exp = d.items.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    view.innerHTML = `
      <div class="sheet-head"><h2>Journal</h2><button class="btn btn-primary btn-sm" id="add">Ajouter</button></div>
      <div class="row" style="grid-template-columns:1fr 1fr">
        <div><label>Type</label><select id="f-type"><option value="">Tout</option><option value="income" ${jState.type === 'income' ? 'selected' : ''}>Encaissements</option><option value="expense" ${jState.type === 'expense' ? 'selected' : ''}>Dépenses</option></select></div>
        <div><label>Catégorie</label><select id="f-cat"><option value="">Toutes</option>${options(TX_CAT, jState.category)}</select></div>
        <div><label>Du</label><input type="date" id="f-from" value="${jState.from}"></div>
        <div><label>Au</label><input type="date" id="f-to" value="${jState.to}"></div>
      </div>
      <div class="field" style="margin:12px 0 0"><input id="f-q" placeholder="Rechercher" value="${esc(jState.q)}"></div>
      <div class="figures">
        <div class="figure in"><div class="k">Encaissé</div><div class="v">${fmtMoney(inc)}</div></div>
        <div class="figure out"><div class="k">Dépensé</div><div class="v">${fmtMoney(exp)}</div></div>
      </div>
      ${d.items.length ? `<div class="list" id="tx-list">${d.items.map((t) => txItem(t, true)).join('')}</div>` : '<div class="empty"><strong>Aucune opération ici.</strong>Changez les filtres ou ajoutez une opération.</div>'}`;
    const refresh = () => renderJournal();
    qs('#add').addEventListener('click', () => txForm({}, refresh));
    const bind = (id, key) => qs(id).addEventListener('change', (e) => { jState[key] = e.target.value; refresh(); });
    bind('#f-type', 'type'); bind('#f-cat', 'category'); bind('#f-from', 'from'); bind('#f-to', 'to');
    let t; qs('#f-q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { jState.q = e.target.value; refresh(); }, 350); });
    const list = qs('#tx-list');
    if (list) list.addEventListener('click', async (e) => {
      const item = e.target.closest('.item'); if (!item) return;
      const tx = d.items.find((x) => x.id === Number(item.dataset.id));
      if (e.target.closest('[data-edit]')) txForm(tx, refresh);
      if (e.target.closest('[data-del]') && await confirmDialog('Supprimer cette opération ?', `${tx.label}, ${fmtMoney(tx.amount)}. Les totaux seront recalculés.`)) {
        await api(`/transactions/${tx.id}`, { method: 'DELETE' }); toast('Supprimé'); refresh();
      }
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
          <div class="sub">${FREQ[s.frequency].replace('N', s.custom_months || 'N')}, prochain le ${fmtDate(s.next_charge_date)}${s.status === 'active' ? ` (${when(s)})` : ''}. ${fmtMoney(s.monthly_cost)} par mois, ${fmtMoney(s.yearly_cost)} par an.</div>
        </div>
        <div class="amount expense">${fmtMoney(s.amount)}</div>
        <div class="actions">
          ${s.status === 'active' ? `<button class="icon-btn" data-confirm title="Confirmer le prélèvement">${ICON.check}</button>` : ''}
          <button class="icon-btn" data-edit title="Modifier">${ICON.edit}</button>
          <button class="icon-btn" data-del title="Supprimer">${ICON.del}</button>
        </div>
      </div>`;
    view.innerHTML = `
      <div class="sheet-head"><h2>Abonnements</h2><button class="btn btn-primary btn-sm" id="add">Ajouter</button></div>
      <div class="figures">
        <div class="figure out"><div class="k">Par mois, abonnements actifs</div><div class="v">${fmtMoney(d.totals.monthly)}</div></div>
        <div class="figure out"><div class="k">Par an</div><div class="v">${fmtMoney(d.totals.yearly)}</div></div>
      </div>
      <p class="small muted">La coche confirme un prélèvement : il passe dans le journal et l'échéance avance.</p>
      ${d.items.length ? `<div class="list" id="sub-list">${d.items.map(subItem).join('')}</div>` : `<div class="empty"><strong>Aucun abonnement.</strong>Prise de rendez-vous, logiciels, assurance, banque : ajoutez-les pour voir ce qu'ils coûtent vraiment et quand ils tombent.</div>`}`;
    const refresh = () => renderSubscriptions();
    qs('#add').addEventListener('click', () => subForm({}, refresh));
    const list = qs('#sub-list');
    if (list) list.addEventListener('click', async (e) => {
      const item = e.target.closest('.item'); if (!item) return;
      const s = d.items.find((x) => x.id === Number(item.dataset.id));
      if (e.target.closest('[data-edit]')) subForm(s, refresh);
      if (e.target.closest('[data-confirm]')) {
        modal(`<h3>Confirmer le prélèvement</h3><p class="muted small">Une dépense « ${esc(s.name)} » est ajoutée au journal et la prochaine échéance avance d'une période.</p>
          <div class="row"><div class="field"><label>Montant, €</label><input name="amount" type="number" step="0.01" min="0" value="${s.amount}"></div><div class="field"><label>Date du prélèvement</label><input name="date" type="date" value="${s.next_charge_date}"></div></div>
          <div class="error" data-error></div>
          <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-primary" type="submit">Confirmer</button></div>`,
        async (data) => { await api(`/subscriptions/${s.id}/confirm`, { method: 'POST', body: data }); toast('Prélèvement ajouté au journal'); refresh(); });
      }
      if (e.target.closest('[data-del]') && await confirmDialog('Supprimer cet abonnement ?', `${s.name}. Les prélèvements déjà confirmés restent dans le journal.`)) {
        await api(`/subscriptions/${s.id}`, { method: 'DELETE' }); toast('Supprimé'); refresh();
      }
    });
  }

  /* ---------- Vue : objectif ---------- */
  async function renderGoals() {
    const d = await api('/dashboard');
    const s = state.settings;
    const pct = Math.min(100, d.goal.progress_pct);
    view.innerHTML = `
      <h2>Objectif</h2>
      <div class="two-col">
        <form class="bloc" id="goal-form" style="border-top:0">
          <div class="field"><label>Chiffre d'affaires visé par mois, €</label><input name="monthly_goal" type="number" step="0.01" min="0" inputmode="decimal" value="${s.monthly_goal || ''}" placeholder="3000"></div>
          <div class="field"><label>Prix moyen d'une prestation, €</label><input name="average_price" type="number" step="0.01" min="0" inputmode="decimal" value="${s.average_price || ''}" placeholder="45"></div>
          <div class="error" data-error></div>
          <button class="btn btn-primary" type="submit">Enregistrer</button>
        </form>
        <div class="bloc">
          <h3>${monthName()}</h3>
          ${s.monthly_goal > 0 ? `
            <div class="hero-figure" style="padding-top:0"><div class="value num" style="font-size:2.8rem">${fmtMoney(d.goal.achieved)}</div><p class="muted small">sur ${fmtMoney(s.monthly_goal)}, ${d.goal.progress_pct} %</p></div>
            <div class="progress"><span style="width:${pct}%"></span></div>
            <p style="margin-top:14px;font-family:var(--display);font-size:1.3rem">${d.goal.remaining_services === null ? '<span class="muted small" style="font-family:var(--ui)">Indiquez un prix moyen pour compter les prestations restantes.</span>' : d.goal.remaining_services === 0 ? 'Objectif atteint.' : `Encore ${d.goal.remaining_services} prestation${d.goal.remaining_services > 1 ? 's' : ''} à ${fmtMoney(s.average_price)}.`}</p>
            <p class="small muted">Arrondi au-dessus de (objectif − encaissé) ÷ prix moyen.</p>`
          : '<div class="empty"><strong>Pas encore d\'objectif.</strong>Renseignez-le pour suivre le mois.</div>'}
        </div>
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
      <h2>Réglages</h2>
      <form class="bloc" id="profile-form" style="border-top:0">
        <h3>Profil</h3>
        ${STATIC ? '' : `<div class="field"><label>E-mail</label><input value="${esc(u.email)}" disabled></div>`}
        <div class="row"><div class="field"><label>Prénom</label><input name="name" maxlength="100" value="${esc(u.name || '')}"></div><div class="field"><label>Nom de l'activité</label><input name="business_name" maxlength="100" value="${esc(u.business_name || '')}"></div></div>
        <div class="error" data-error></div><button class="btn btn-ghost btn-sm" type="submit">Enregistrer</button>
      </form>
      <form class="bloc" id="rate-form">
        <h3>Cotisations estimées</h3>
        <p class="notice" style="margin-bottom:12px">Le taux dépend de votre situation (ACRE, versement libératoire, activité). Vérifiez-le auprès de l'Urssaf : l'application estime, elle ne déclare pas.</p>
        <div class="field"><label>Taux appliqué au chiffre d'affaires, %</label><input name="rate_pct" type="number" step="0.01" min="0" max="100" inputmode="decimal" value="${(s.contribution_rate * 100).toFixed(2)}"></div>
        <div class="field"><label>Note, par exemple la date de vérification</label><input name="contribution_note" maxlength="500" value="${esc(s.contribution_note || '')}"></div>
        <div class="error" data-error></div><button class="btn btn-ghost btn-sm" type="submit">Enregistrer</button>
      </form>
      <form class="bloc" id="theme-form">
        <h3>Votre vernis</h3>
        <input type="hidden" name="theme" value="${s.theme}">
        <div class="swatches" style="margin-bottom:14px">${Object.entries(THEMES).map(([k, [n, c]]) => `<button type="button" class="swatch ${s.theme === k && !s.accent_color ? 'active' : ''}" data-theme="${k}" style="--c:${c}" title="${n}" aria-label="${n}"></button>`).join('')}</div>
        <div class="row" style="align-items:end"><div class="field"><label>Ou votre propre teinte</label><input name="accent_color" type="color" value="${s.accent_color || '#b3123f'}"></div><div class="field"><label style="display:flex;align-items:center;gap:8px;color:var(--nacre);min-height:44px"><input type="checkbox" name="use_custom" style="width:auto;min-height:0" ${s.accent_color ? 'checked' : ''}> Utiliser cette teinte</label></div></div>
        <div class="error" data-error></div><button class="btn btn-ghost btn-sm" type="submit">Appliquer</button>
      </form>
      <form class="bloc ${STATIC ? 'hidden' : ''}" id="pwd-form">
        <h3>Mot de passe</h3>
        <div class="row"><div class="field"><label>Actuel</label><input name="current" type="password" autocomplete="current-password" required></div><div class="field"><label>Nouveau, 8 caractères au moins</label><input name="password" type="password" autocomplete="new-password" minlength="8" required></div></div>
        <div class="error" data-error></div><button class="btn btn-ghost btn-sm" type="submit">Changer le mot de passe</button>
      </form>
      <div class="bloc ${STATIC ? 'hidden' : ''}">
        <h3>Accès</h3>
        <p class="small"><span class="tag ${pay.access_status === 'active' ? 'ok' : 'warn'}">${pay.access_status === 'active' ? 'Accès actif' : pay.access_status === 'pending' ? 'En attente de paiement' : 'Accès suspendu'}</span>${pay.free_access ? ' <span class="tag">accès libre, mode local</span>' : ''}</p>
        ${pay.payments.length ? `<div class="list">${pay.payments.map((p) => `<div class="item"><div class="main"><div class="title">${p.kind === 'initial' ? 'Accès initial' : p.kind === 'refund' ? 'Remboursement' : 'Abonnement'}</div><div class="sub">${p.created_at}, ${p.status}</div></div><div class="amount">${p.amount_cents != null ? fmtMoney(p.amount_cents / 100) : ''}</div></div>`).join('')}</div>` : ''}
        <a class="btn btn-ghost btn-sm" href="/acces" style="margin-top:8px">Voir mon accès</a>
      </div>
      <div class="bloc">
        <h3>Vos données</h3>
        <p class="small muted">${STATIC ? 'Vos données restent dans ce navigateur, sur cet appareil. Exportez-les en JSON pour les sauvegarder ou les transférer, puis importez-les ailleurs.' : 'Exportez toutes vos opérations et abonnements, ou supprimez définitivement le compte et tout ce qu\'il contient.'}</p>
        <div class="actions"><a class="btn btn-ghost btn-sm" href="/api/settings/export.csv">Exporter en CSV</a><a class="btn btn-ghost btn-sm" href="/api/settings/export.json">Exporter en JSON</a>${STATIC ? '<label class="btn btn-ghost btn-sm" style="margin:0">Importer un JSON<input type="file" id="import-json" accept="application/json" class="hidden"></label>' : ''}<button class="btn btn-danger btn-sm" id="del-account">${STATIC ? 'Tout effacer' : 'Supprimer mon compte'}</button></div>
      </div>
      <p class="small muted" style="margin-top:16px"><a href="/legal/mentions-legales.html">Mentions légales</a>, <a href="/legal/cgu.html">conditions d'utilisation</a>, <a href="/legal/cgv.html">conditions de vente</a>, <a href="/legal/confidentialite.html">confidentialité</a>, <a href="/support">support</a>.</p>`;

    const submit = (id, fn) => qs(id).addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target; qs('[data-error]', f).textContent = ''; try { await fn(Object.fromEntries(new FormData(f)), f); } catch (ex) { qs('[data-error]', f).textContent = ex.message; } });
    submit('#profile-form', async (d) => { await api('/settings/profile', { method: 'PUT', body: d }); Object.assign(state.user, d); toast('Profil enregistré'); });
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
      <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-danger" type="submit">Effacer</button></div>`,
      async () => { await api('/settings/delete-account', { method: 'POST', body: {} }); location.reload(); })); return; }
    qs('#del-account').addEventListener('click', () => modal(`<h3>Supprimer le compte</h3><p class="muted small">Définitif : opérations, abonnements et réglages seront effacés. Exportez vos données avant si besoin.</p>
      <div class="field"><label>Votre mot de passe</label><input name="password" type="password" required></div><div class="error" data-error></div>
      <div class="actions" style="justify-content:flex-end"><button class="btn btn-ghost" data-close>Annuler</button><button class="btn btn-danger" type="submit">Supprimer définitivement</button></div>`,
    async (d) => { await api('/settings/delete-account', { method: 'POST', body: d }); location.href = '/'; }));
  }

  /* ---------- Routeur ---------- */
  const routes = { '/app': renderDashboard, '/app/journal': renderJournal, '/app/abonnements': renderSubscriptions, '/app/objectifs': renderGoals, '/app/parametres': renderSettings };
  const STATIC = Boolean(BBM.STATIC);
  const currentPath = () => STATIC ? ('/app' + (location.hash.replace('#', '') ? '/' + location.hash.replace('#', '') : '')) : location.pathname;
  async function navigate(path, push = true) {
    const fn = routes[path] || routes['/app'];
    if (push) { if (STATIC) { const h = path.replace('/app', '').replace(/^\//, ''); if (location.hash.replace('#', '') !== h) { suppressHash = true; location.hash = h; } } else history.pushState({}, '', path); }
    document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.route === path));
    qs('#fab').classList.toggle('hidden', path === '/app/parametres');
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
    e.preventDefault(); navigate(path);
  });
  let suppressHash = false;
  window.addEventListener('popstate', () => { if (!STATIC) navigate(location.pathname, false); });
  window.addEventListener('hashchange', () => { if (suppressHash) { suppressHash = false; return; } navigate(currentPath(), false); });
  qs('#fab').addEventListener('click', () => txForm({}, () => navigate(currentPath(), false)));
  qs('#btn-logout').addEventListener('click', async () => { if (STATIC) return (location.href = 'index.html'); await api('/auth/logout', { method: 'POST' }); try { localStorage.removeItem('bbm_theme'); } catch {} location.href = '/'; });
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
      applyTheme(state.settings);
      if (state.user.access_status !== 'active') return location.replace('/acces');
      navigate(currentPath(), false);
    } catch { location.replace('/connexion'); }
  })();
})();
