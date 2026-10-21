/**
 * Règles métier — CDC §6. Fonctions pures, sans accès BDD, testées dans tests/calc.test.js.
 * Toutes les valeurs monétaires sont des nombres (euros, 2 décimales) ; on arrondit en sortie.
 */

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Somme des recettes et des dépenses d'une liste d'opérations. */
function totals(transactions) {
  let revenue = 0;
  let expenses = 0;
  for (const t of transactions) {
    if (t.type === 'income') revenue += Number(t.amount) || 0;
    else if (t.type === 'expense') expenses += Number(t.amount) || 0;
  }
  return { revenue: round2(revenue), expenses: round2(expenses) };
}

/** Cotisations estimées = CA éligible × taux (0.212 pour 21,2 %). */
function estimatedContributions(revenue, rate) {
  const r = Number(rate);
  if (!Number.isFinite(r) || r < 0) return 0;
  return round2(Number(revenue) * r);
}

/** Reste estimé = CA − dépenses − cotisations estimées. Peut être négatif. */
function estimatedRemaining(revenue, expenses, contributions) {
  return round2(Number(revenue) - Number(expenses) - Number(contributions));
}

/** Progression vers l'objectif en %, 0 si objectif nul ou invalide. Non plafonné (peut dépasser 100). */
function goalProgress(revenue, goal) {
  const g = Number(goal);
  if (!Number.isFinite(g) || g <= 0) return 0;
  return round2((Number(revenue) / g) * 100);
}

/** Prestations restantes = max(0, ceil((objectif − CA) / prix moyen)). null si prix moyen invalide. */
function remainingServices(revenue, goal, averagePrice) {
  const p = Number(averagePrice);
  const g = Number(goal);
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(g) || g <= 0) return null;
  const remaining = g - Number(revenue);
  if (remaining <= 0) return 0;
  return Math.ceil(remaining / p);
}

/** Nombre de mois entre deux prélèvements pour une fréquence donnée. */
function monthsPerPeriod(sub) {
  switch (sub.frequency) {
    case 'monthly': return 1;
    case 'quarterly': return 3;
    case 'yearly': return 12;
    case 'weekly': return 12 / 52; // ≈ 0.2308 — règle explicite : 52 prélèvements par an
    case 'custom': {
      const n = Number(sub.custom_months);
      return Number.isFinite(n) && n > 0 ? n : 1;
    }
    default: return 1;
  }
}

/** Coût mensuel normalisé d'un abonnement (CDC §6). */
function subscriptionMonthlyCost(sub) {
  if (sub.frequency === 'weekly') return round2((Number(sub.amount) * 52) / 12);
  return round2(Number(sub.amount) / monthsPerPeriod(sub));
}

/** Coût annuel normalisé d'un abonnement (CDC §6). */
function subscriptionYearlyCost(sub) {
  if (sub.frequency === 'weekly') return round2(Number(sub.amount) * 52);
  return round2((Number(sub.amount) * 12) / monthsPerPeriod(sub));
}

/** Totaux des abonnements actifs uniquement (en pause / résiliés exclus). */
function subscriptionTotals(subs) {
  let monthly = 0;
  let yearly = 0;
  for (const s of subs) {
    if (s.status !== 'active') continue;
    monthly += subscriptionMonthlyCost(s);
    yearly += subscriptionYearlyCost(s);
  }
  return { monthly: round2(monthly), yearly: round2(yearly) };
}

/** Date ISO (YYYY-MM-DD) du prélèvement suivant après `fromDate`. */
function addPeriod(dateStr, sub) {
  const d = new Date(dateStr + 'T00:00:00Z');
  if (sub.frequency === 'weekly') {
    d.setUTCDate(d.getUTCDate() + 7);
  } else {
    const months = monthsPerPeriod(sub);
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
  }
  return d.toISOString().slice(0, 10);
}

/** Nombre de jours entre aujourd'hui (YYYY-MM-DD) et une date. Négatif si passée. */
function daysUntil(dateStr, today) {
  const a = new Date(today + 'T00:00:00Z');
  const b = new Date(dateStr + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

/** Bornes d'une période : 'current' | 'previous' | 'year' | 'previous_year' | 'custom' (from/to). */
function periodBounds(kind, today, from, to) {
  const [y, m] = today.split('-').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const endOfMonth = (yy, mm) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  if (kind === 'year') return { from: `${y}-01-01`, to: `${y}-12-31` };
  if (kind === 'previous_year') return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  if (kind === 'previous') {
    const py = m === 1 ? y - 1 : y;
    const pm = m === 1 ? 12 : m - 1;
    return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(endOfMonth(py, pm))}` };
  }
  if (kind === 'custom' && /^\d{4}-\d{2}-\d{2}$/.test(from || '') && /^\d{4}-\d{2}-\d{2}$/.test(to || '') && from <= to) {
    return { from, to };
  }
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(endOfMonth(y, m))}` };
}

/** Bornes de la semaine en cours (lundi → dimanche) contenant `today`. */
function weekBounds(today) {
  const d = new Date(today + 'T00:00:00Z');
  const dow = (d.getUTCDay() + 6) % 7; // lundi = 0
  const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - dow);
  const sun = new Date(mon); sun.setUTCDate(mon.getUTCDate() + 6);
  return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
}

/** Variation en % entre deux valeurs ; null si la référence est nulle. */
function pctChange(current, previous) {
  const p = Number(previous), c = Number(current);
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(c)) return null;
  return Math.round(((c - p) / p) * 100);
}

window.CALC = {
  round2,
  weekBounds,
  pctChange,
  totals,
  estimatedContributions,
  estimatedRemaining,
  goalProgress,
  remainingServices,
  monthsPerPeriod,
  subscriptionMonthlyCost,
  subscriptionYearlyCost,
  subscriptionTotals,
  addPeriod,
  daysUntil,
  periodBounds,
};
