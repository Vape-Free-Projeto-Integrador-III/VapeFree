// src/utils/insights.js
//
// Funções PURAS de derivação — igual utils/achievements.js, não leem nem
// escrevem nada. Recebem a lista de registros e devolvem os padrões que o
// usuário consegue enxergar sobre si mesmo (gatilho mais comum, dia da
// semana crítico, etc.).
//
// Nada aqui usa o campo "time" do registro: ele guarda a hora em que o
// formulário foi salvo, não a hora em que a pessoa usou o vape (o registro
// pode ser retroativo pelo date picker). Insight de horário sairia errado.

import { recordPuffs } from './records';
import { TRIGGERS, HELPS } from './theme';

export const MIN_RECORDS_FOR_INSIGHTS = 7;

const FALLBACK_EMOJI = '📌';
// Domingo e sábado são masculinos ("aos domingos"), o resto é feminino
// ("às segundas-feiras") — por isso a preposição vem junto do rótulo.
const WEEKDAYS = [
  'aos domingos',
  'às segundas-feiras',
  'às terças-feiras',
  'às quartas-feiras',
  'às quintas-feiras',
  'às sextas-feiras',
  'aos sábados',
];

// O Slider às vezes entrega a intensidade como array ([n]) em vez de número.
export function normalizeIntensity(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return Number(raw) || 0;
}

// Meio-dia evita o off-by-one de fuso que o parse UTC puro causaria.
export function parseLocalDate(dateStr) {
  return new Date(`${dateStr}T12:00:00`);
}

function emojiForLabel(label) {
  const found =
    TRIGGERS.find((t) => t.label === label) || HELPS.find((h) => h.label === label);
  return found ? found.emoji : FALLBACK_EMOJI;
}

function countLabels(records, field) {
  const counts = {};
  records.forEach((record) => {
    (record[field] || []).forEach((label) => {
      counts[label] = (counts[label] || 0) + 1;
    });
  });
  return counts;
}

function topEntry(counts) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return { label: entries[0][0], count: entries[0][1] };
}

function mostCommonTrigger(usedRecords) {
  const top = topEntry(countLabels(usedRecords, 'triggers'));
  if (!top || usedRecords.length === 0) return null;

  const percent = Math.round((top.count / usedRecords.length) * 100);
  return {
    id: 'trigger_comum',
    label: top.label,
    icon: emojiForLabel(top.label),
    title: `Seu gatilho mais comum é ${top.label}`,
    detail: `Aparece em ${percent}% dos dias em que você usou.`,
  };
}

// Só o rótulo do gatilho mais comum — usado pela tela de crise para a
// mensagem personalizada, sem precisar do pacote inteiro de insights.
export function topTriggerLabel(records) {
  const used = (Array.isArray(records) ? records : []).filter((r) => r.used);
  const top = topEntry(countLabels(used, 'triggers'));
  return top ? top.label : null;
}

function riskiestWeekday(records) {
  const byWeekday = {};
  records.forEach((record) => {
    const day = parseLocalDate(record.date).getDay();
    if (!byWeekday[day]) byWeekday[day] = { total: 0, count: 0 };
    byWeekday[day].total += recordPuffs(record);
    byWeekday[day].count += 1;
  });

  // Um único registro num dia da semana não é padrão, é coincidência.
  const candidates = Object.entries(byWeekday)
    .filter(([, { count }]) => count >= 2)
    .map(([day, { total, count }]) => ({ day: Number(day), average: total / count }))
    .filter(({ average }) => average > 0);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.average - a.average);
  const top = candidates[0];
  return {
    id: 'dia_semana',
    icon: '📅',
    title: `Você usa mais ${WEEKDAYS[top.day]}`,
    detail: `Média de ${Math.round(top.average)} puxadas nesse dia da semana.`,
  };
}

function strongestTrigger(usedRecords) {
  const stats = {};
  usedRecords.forEach((record) => {
    const intensity = normalizeIntensity(record.intensity);
    (record.triggers || []).forEach((label) => {
      if (!stats[label]) stats[label] = { total: 0, count: 0 };
      stats[label].total += intensity;
      stats[label].count += 1;
    });
  });

  const candidates = Object.entries(stats)
    .filter(([, { count }]) => count >= 2)
    .map(([label, { total, count }]) => ({ label, average: total / count }));

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.average - a.average);
  const top = candidates[0];
  return {
    id: 'gatilho_intenso',
    label: top.label,
    icon: '🔥',
    title: `${top.label} é o que te dá mais vontade`,
    detail: `Nesses dias sua vontade média é ${(Math.round(top.average * 10) / 10)
      .toFixed(1)
      .replace('.', ',')}/10.`,
  };
}

function bestHelp(freeRecords) {
  const top = topEntry(countLabels(freeRecords, 'helps'));
  if (!top) return null;

  return {
    id: 'ajuda',
    icon: emojiForLabel(top.label),
    title: `${top.label} é o que mais te ajuda`,
    detail: `Apareceu em ${top.count} ${top.count === 1 ? 'dia' : 'dias'} sem usar.`,
  };
}

// ─── Modo crise ──────────────────────────────────────────────────────────────

export const CRISIS_METHODS = {
  respiracao: { label: 'Respiração guiada', emoji: '🧘' },
  timer: { label: 'Aguentar alguns minutos', emoji: '⏱️' },
  distracao: { label: 'Distrações rápidas', emoji: '💧' },
};

// "Passou" vale 1, "diminuiu" vale meio ponto — diminuir também é vitória,
// só não do mesmo tamanho. "usei" vale 0.
const OUTCOME_WEIGHT = { passou: 1, diminuiu: 0.5, usei: 0 };

// Qual método já funcionou melhor PRA ESTE usuário. Só considera método com
// pelo menos 2 sessões avaliadas — uma sessão é sorte, não padrão (mesma
// regra de riskiestWeekday e strongestTrigger).
export function recommendedCrisisMethod(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  const stats = {};

  list.forEach((session) => {
    const weight = OUTCOME_WEIGHT[session.outcome];
    if (weight === undefined || !CRISIS_METHODS[session.method]) return;
    if (!stats[session.method]) stats[session.method] = { total: 0, count: 0 };
    stats[session.method].total += weight;
    stats[session.method].count += 1;
  });

  const candidates = Object.entries(stats)
    .filter(([, { count }]) => count >= 2)
    .map(([method, { total, count }]) => ({ method, successRate: total / count }))
    .filter(({ successRate }) => successRate > 0);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => b.successRate - a.successRate);
  return candidates[0];
}

// Períodos do dia. Diferente do campo "time" do registro (que é a hora em
// que o formulário foi salvo), o "time" da sessão de crise é a hora real em
// que a vontade bateu — então aqui insight de horário faz sentido.
const DAY_PERIODS = [
  { id: 'madrugada', label: 'de madrugada', from: 0, to: 5 },
  { id: 'manha', label: 'de manhã', from: 6, to: 11 },
  { id: 'tarde', label: 'à tarde', from: 12, to: 17 },
  { id: 'noite', label: 'à noite', from: 18, to: 23 },
];

function periodOf(timeStr) {
  const hour = Number(String(timeStr || '').slice(0, 2));
  if (Number.isNaN(hour)) return null;
  return DAY_PERIODS.find((p) => hour >= p.from && hour <= p.to) || null;
}

function crisisCount(sessions) {
  const survived = sessions.filter((s) => s.outcome === 'passou' || s.outcome === 'diminuiu');
  if (survived.length < 2) return null;

  return {
    id: 'crise_superadas',
    icon: '🛟',
    title: `Você superou ${survived.length} ${survived.length === 1 ? 'crise' : 'crises'}`,
    detail: `Foram ${sessions.length} ${sessions.length === 1 ? 'vez' : 'vezes'} que você abriu o modo crise em vez de simplesmente usar.`,
  };
}

function crisisBestMethod(sessions) {
  const best = recommendedCrisisMethod(sessions);
  if (!best) return null;

  const percent = Math.round(best.successRate * 100);
  return {
    id: 'crise_metodo',
    icon: CRISIS_METHODS[best.method].emoji,
    title: `${CRISIS_METHODS[best.method].label} é o que mais te segura`,
    detail: `Nas crises em que você usou esse método, ${percent}% terminaram sem uso ou com a vontade menor.`,
  };
}

function crisisSuccessRate(sessions) {
  const answered = sessions.filter((s) => s.outcome);
  if (answered.length < 3) return null;

  const held = answered.filter((s) => s.outcome !== 'usei');
  const percent = Math.round((held.length / answered.length) * 100);
  if (percent === 0) return null;

  return {
    id: 'crise_taxa',
    icon: '💪',
    title: `Você aguenta ${percent}% das crises`,
    detail: `${held.length} de ${answered.length} vezes a vontade passou ou diminuiu sem você usar.`,
  };
}

function crisisPeriod(sessions) {
  const counts = {};
  sessions.forEach((session) => {
    const period = periodOf(session.time);
    if (period) counts[period.id] = (counts[period.id] || 0) + 1;
  });

  const top = topEntry(counts);
  // Menos de 3 crises no mesmo período é coincidência, não horário de risco.
  if (!top || top.count < 3) return null;

  const period = DAY_PERIODS.find((p) => p.id === top.label);
  return {
    id: 'crise_horario',
    icon: '🕒',
    title: `Sua vontade bate mais ${period.label}`,
    detail: `${top.count} das suas crises começaram nesse período. Vale se preparar antes dessa hora.`,
  };
}

// Insights do modo crise. Não dependem de MIN_RECORDS_FOR_INSIGHTS: quem
// usou o modo crise já gerou dado próprio, mesmo com poucos registros.
export function computeCrisisInsights(crisisSessions) {
  const sessions = Array.isArray(crisisSessions) ? crisisSessions : [];
  if (sessions.length === 0) return [];

  return [
    crisisCount(sessions),
    crisisSuccessRate(sessions),
    crisisBestMethod(sessions),
    crisisPeriod(sessions),
  ].filter(Boolean);
}

export function computeInsights(records, crisisSessions = []) {
  const list = Array.isArray(records) ? records : [];
  const crisisItems = computeCrisisInsights(crisisSessions);

  if (list.length < MIN_RECORDS_FOR_INSIGHTS) {
    // Ainda sem registros suficientes pros padrões de uso, mas se já tem
    // insight de crise vale mostrar em vez de esconder tudo.
    if (crisisItems.length > 0) {
      return { ready: true, missing: MIN_RECORDS_FOR_INSIGHTS - list.length, items: crisisItems };
    }
    return { ready: false, missing: MIN_RECORDS_FOR_INSIGHTS - list.length, items: [] };
  }

  const usedRecords = list.filter((r) => r.used);
  const freeRecords = list.filter((r) => !r.used);

  const common = mostCommonTrigger(usedRecords);
  let strongest = strongestTrigger(usedRecords);

  // Se o gatilho mais intenso for o mesmo que o mais comum, as duas linhas
  // dizem quase a mesma coisa — fica só a primeira.
  if (common && strongest && common.label === strongest.label) {
    strongest = null;
  }

  const items = [common, riskiestWeekday(list), strongest, bestHelp(freeRecords)]
    .filter(Boolean)
    .slice(0, 4)
    .concat(crisisItems);

  return { ready: true, missing: 0, items };
}
