/* Version statique : remplace l'API serveur par un stockage dans le navigateur (localStorage).
   Même surface que les routes /api/* pour que app.js reste identique. Les données ne quittent jamais l'appareil. */
(() => {
  const C = window.CALC;
  const KEY = 'bbm_data_v1';
  const today = () => new Date().toISOString().slice(0, 10);
  const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

  const fresh = () => ({
    seq: 1,
    user: { id: 1, email: 'moi@local', name: '', business_name: '', access_status: 'active', subscription_status: null, created_at: now() },
    settings: { user_id: 1, contribution_rate: 0.212, contribution_note: null, monthly_goal: 0, average_price: 0, theme: 'laque', accent_color: null, currency: 'EUR' },
    transactions: [],
    subscriptions: [],
  });
  let data;
  try { data = JSON.parse(localStorage.getItem(KEY) || 'null') || fresh(); } catch { data = fresh(); }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.error('Sauvegarde impossible', e); } };
  const nextId = () => data.seq++;

  const err = (message, status = 400, field) => { const e = new Error(message); e.status = status; e.field = field; return e; };
  const money = (v, field) => { const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v); if (!Number.isFinite(n) || n < 0 || n > 1e9) throw err(`${field} invalide`, 400, field); return Math.round(n * 100) / 100; };
  const str = (v, field, max, required = true) => { v = String(v ?? '').trim(); if (required && !v) throw err(`${field} est obligatoire`, 400, field); if (v.length > max) throw err(`${field} est trop long`, 400, field); return v; };
  const date = (v, field = 'date') => { v = String(v ?? '').trim(); if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(v + 'T00:00:00Z'))) throw err(`${field} invalide`, 400, field); return v; };
  const oneOf = (v, field, list, def) => { if ((v === undefined || v === null || v === '') && def !== undefined) return def; if (!list.includes(v)) throw err(`${field} invalide`, 400, field); return v; };

  const TX_CAT = ['prestation', 'vente', 'fournitures', 'materiel', 'abonnement', 'loyer', 'formation', 'marketing', 'transport', 'frais', 'autre'];
  const SUB_CAT = ['logiciel', 'reservation', 'reseaux', 'assurance', 'banque', 'telephonie', 'formation', 'local', 'autre'];
  const FREQ = ['monthly', 'quarterly', 'yearly', 'weekly', 'custom'];
  const STATUS = ['active', 'paused', 'canceled'];

  const parseTx = (b) => ({
    type: oneOf(b.type, 'type', ['income', 'expense']), label: str(b.label, 'libellé', 120), amount: money(b.amount, 'montant'),
    date: date(b.date), category: oneOf(b.category, 'catégorie', TX_CAT, 'autre'), note: str(b.note, 'note', 1000, false) || null,
  });
  const parseSub = (b) => {
    const frequency = oneOf(b.frequency, 'fréquence', FREQ);
    let custom_months = null;
    if (frequency === 'custom') { custom_months = Number(b.custom_months); if (!Number.isInteger(custom_months) || custom_months < 1 || custom_months > 60) throw err('Indiquez un nombre de mois entre 1 et 60', 400, 'custom_months'); }
    return { name: str(b.name, 'nom', 120), amount: money(b.amount, 'montant'), frequency, custom_months, next_charge_date: date(b.next_charge_date, 'prochaine date'),
      category: oneOf(b.category, 'catégorie', SUB_CAT, 'autre'), status: oneOf(b.status, 'statut', STATUS, 'active'), note: str(b.note, 'note', 1000, false) || null };
  };
  const enrichSub = (s, t = today()) => ({ ...s, monthly_cost: C.subscriptionMonthlyCost(s), yearly_cost: C.subscriptionYearlyCost(s), days_until: C.daysUntil(s.next_charge_date, t), due_soon: s.status === 'active' && C.daysUntil(s.next_charge_date, t) <= 7 });
  const sortSubs = (list) => [...list].sort((a, b) => ({ active: 0, paused: 1, canceled: 2 }[a.status] - { active: 0, paused: 1, canceled: 2 }[b.status]) || a.next_charge_date.localeCompare(b.next_charge_date));

  const csvEsc = (v) => { if (v == null) return ''; const s = String(v); return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const exportCsv = () => {
    const lines = ['﻿section;id;type;libelle;montant;date;categorie;frequence;prochaine_date;statut;note'];
    for (const t of [...data.transactions].sort((a, b) => a.date.localeCompare(b.date))) lines.push(['operation', t.id, t.type === 'income' ? 'recette' : 'depense', t.label, String(t.amount).replace('.', ','), t.date, t.category, '', '', '', t.note].map(csvEsc).join(';'));
    for (const s of data.subscriptions) lines.push(['abonnement', s.id, '', s.name, String(s.amount).replace('.', ','), '', s.category, s.frequency + (s.custom_months ? `(${s.custom_months} mois)` : ''), s.next_charge_date, s.status, s.note].map(csvEsc).join(';'));
    return lines.join('\r\n');
  };

  const handlers = {
    'GET /auth/me': () => ({ user: data.user, settings: data.settings, config: { freeAccess: true, subscriptionEnabled: false, priceInitialCents: 1000, static: true } }),
    'POST /auth/logout': () => ({ ok: true }),
    'POST /auth/password': () => ({ ok: true }),
    'GET /payment/status': () => ({ access_status: 'active', subscription_status: null, free_access: true, stripe_configured: false, subscription_enabled: false, price_initial_cents: 1000, payments: [] }),

    'GET /dashboard': (q) => {
      const t = today();
      const period = C.periodBounds(q.get('period'), t, q.get('from'), q.get('to'));
      const s = data.settings;
      const txs = data.transactions.filter((x) => x.date >= period.from && x.date <= period.to);
      const { revenue, expenses } = C.totals(txs);
      const contributions = C.estimatedContributions(revenue, s.contribution_rate);
      const subs = sortSubs(data.subscriptions.filter((x) => x.status === 'active'));
      const hist = {};
      const start = new Date(); start.setDate(1); start.setMonth(start.getMonth() - 5);
      const startIso = start.toISOString().slice(0, 7);
      for (const x of data.transactions) { const m = x.date.slice(0, 7); if (m < startIso) continue; hist[m] = hist[m] || { month: m, revenue: 0, expenses: 0 }; hist[m][x.type === 'income' ? 'revenue' : 'expenses'] += x.amount; }
      return {
        period: { ...period, kind: q.get('period') || 'current' },
        kpis: { revenue, expenses, contributions, remaining: C.estimatedRemaining(revenue, expenses, contributions), contribution_rate: s.contribution_rate },
        goal: { monthly_goal: s.monthly_goal, average_price: s.average_price, achieved: revenue, remaining_amount: Math.max(0, C.round2(s.monthly_goal - revenue)), progress_pct: C.goalProgress(revenue, s.monthly_goal), remaining_services: C.remainingServices(revenue, s.monthly_goal, s.average_price) },
        subscriptions: { monthly_cost: C.subscriptionTotals(subs).monthly, upcoming: subs.map((x) => ({ id: x.id, name: x.name, amount: x.amount, next_charge_date: x.next_charge_date, days_until: C.daysUntil(x.next_charge_date, t) })).filter((x) => x.days_until <= 7).slice(0, 10) },
        recent: [...data.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id).slice(0, 5),
        history: Object.values(hist).map((h) => ({ ...h, revenue: C.round2(h.revenue), expenses: C.round2(h.expenses) })).sort((a, b) => a.month.localeCompare(b.month)),
        today: t,
      };
    },

    'GET /transactions': (q) => {
      let items = data.transactions;
      if (q.get('type')) items = items.filter((x) => x.type === q.get('type'));
      if (q.get('from')) items = items.filter((x) => x.date >= q.get('from'));
      if (q.get('to')) items = items.filter((x) => x.date <= q.get('to'));
      if (q.get('category')) items = items.filter((x) => x.category === q.get('category'));
      if (q.get('q')) { const s = q.get('q').toLowerCase(); items = items.filter((x) => x.label.toLowerCase().includes(s) || (x.note || '').toLowerCase().includes(s)); }
      items = [...items].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
      return { items: items.slice(0, 500), total: items.length, categories: TX_CAT };
    },
    'POST /transactions': (q, b) => { const t = { id: nextId(), user_id: 1, ...parseTx(b), subscription_id: null, created_at: now(), updated_at: now() }; data.transactions.push(t); save(); return t; },
    'PUT /transactions/:id': (q, b, id) => { const t = data.transactions.find((x) => x.id === id); if (!t) throw err('Opération introuvable', 404); Object.assign(t, parseTx(b), { updated_at: now() }); save(); return t; },
    'DELETE /transactions/:id': (q, b, id) => { const i = data.transactions.findIndex((x) => x.id === id); if (i < 0) throw err('Opération introuvable', 404); data.transactions.splice(i, 1); save(); return { ok: true }; },

    'GET /subscriptions': () => ({ items: sortSubs(data.subscriptions).map((s) => enrichSub(s)), totals: C.subscriptionTotals(data.subscriptions), frequencies: FREQ, statuses: STATUS, categories: SUB_CAT, today: today() }),
    'POST /subscriptions': (q, b) => { const s = { id: nextId(), user_id: 1, ...parseSub(b), created_at: now(), updated_at: now() }; data.subscriptions.push(s); save(); return enrichSub(s); },
    'PUT /subscriptions/:id': (q, b, id) => { const s = data.subscriptions.find((x) => x.id === id); if (!s) throw err('Abonnement introuvable', 404); Object.assign(s, parseSub(b), { updated_at: now() }); save(); return enrichSub(s); },
    'PATCH /subscriptions/:id/status': (q, b, id) => { const s = data.subscriptions.find((x) => x.id === id); if (!s) throw err('Abonnement introuvable', 404); s.status = oneOf(b.status, 'statut', STATUS); save(); return enrichSub(s); },
    'POST /subscriptions/:id/confirm': (q, b, id) => {
      const s = data.subscriptions.find((x) => x.id === id); if (!s) throw err('Abonnement introuvable', 404);
      const d = b.date ? date(b.date) : s.next_charge_date;
      const amount = b.amount !== undefined && b.amount !== '' ? money(b.amount, 'montant') : s.amount;
      if (data.transactions.some((x) => x.subscription_id === id && x.date === d)) throw err('Ce prélèvement est déjà dans le journal à cette date', 409);
      const t = { id: nextId(), user_id: 1, type: 'expense', label: s.name, amount, date: d, category: 'abonnement', note: 'Prélèvement confirmé', subscription_id: id, created_at: now(), updated_at: now() };
      data.transactions.push(t); s.next_charge_date = C.addPeriod(s.next_charge_date, s); s.updated_at = now(); save();
      return { transaction: t, subscription: enrichSub(s) };
    },
    'DELETE /subscriptions/:id': (q, b, id) => { const i = data.subscriptions.findIndex((x) => x.id === id); if (i < 0) throw err('Abonnement introuvable', 404); data.subscriptions.splice(i, 1); for (const t of data.transactions) if (t.subscription_id === id) t.subscription_id = null; save(); return { ok: true }; },

    'PUT /settings/goals': (q, b) => { data.settings.monthly_goal = money(b.monthly_goal, 'objectif mensuel'); data.settings.average_price = money(b.average_price, 'prix moyen'); save(); return data.settings; },
    'PUT /settings/contributions': (q, b) => { const r = Number(b.contribution_rate); if (!Number.isFinite(r) || r < 0 || r > 1) throw err('Le taux doit être entre 0 et 100 %', 400); data.settings.contribution_rate = r; data.settings.contribution_note = str(b.contribution_note, 'note', 500, false) || null; save(); return data.settings; },
    'PUT /settings/theme': (q, b) => { data.settings.theme = oneOf(b.theme, 'thème', ['laque', 'rose', 'champagne', 'nude', 'prune'], 'laque'); const c = String(b.accent_color || '').trim(); if (c && !/^#[0-9a-fA-F]{6}$/.test(c)) throw err('Couleur invalide', 400); data.settings.accent_color = c ? c.toLowerCase() : null; save(); return data.settings; },
    'PUT /settings/profile': (q, b) => { data.user.name = str(b.name, 'nom', 100, false) || null; data.user.business_name = str(b.business_name, 'nom', 100, false) || null; save(); return { ok: true }; },
    'GET /settings/export.csv': () => exportCsv(),
    'GET /settings/export.json': () => ({ exported_at: new Date().toISOString(), user: data.user, settings: data.settings, transactions: data.transactions, subscriptions: data.subscriptions }),
    'POST /settings/delete-account': () => { data = fresh(); save(); return { ok: true }; },
  };

  async function api(path, { method = 'GET', body } = {}) {
    const [p, qsStr] = path.split('?');
    const q = new URLSearchParams(qsStr || '');
    for (const key of Object.keys(handlers)) {
      const [m, pat] = key.split(' ');
      if (m !== method) continue;
      const re = new RegExp('^' + pat.replace(':id', '(\\d+)') + '$');
      const mm = p.match(re);
      if (mm) return handlers[key](q, body || {}, mm[1] ? Number(mm[1]) : undefined);
    }
    throw err('Route introuvable', 404);
  }

  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function importJson(file) {
    return file.text().then((txt) => {
      const d = JSON.parse(txt);
      if (!Array.isArray(d.transactions) || !Array.isArray(d.subscriptions)) throw err('Fichier non reconnu');
      data = { ...fresh(), ...d, seq: Math.max(1, ...d.transactions.map((x) => x.id), ...d.subscriptions.map((x) => x.id)) + 1 };
      save();
    });
  }

  window.BBM.api = api;
  window.BBM.STATIC = true;
  window.BBM.local = { download, exportCsv, importJson, exportJson: () => JSON.stringify(handlers['GET /settings/export.json'](), null, 2) };
})();
