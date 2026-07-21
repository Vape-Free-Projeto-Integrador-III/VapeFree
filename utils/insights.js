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

function riskiestWeekday(records) {
  const byWeekday = {};
  records.forEach((record) => {
    const day = parseLocalDate(record.date).getDay();
    if (!byWeekday[day]) byWeekday[day] = { total: 0, count: 0 };
    byWeekday[day].total += record.puffs || 0;
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

export function computeInsights(records) {
  const list = Array.isArray(records) ? records : [];

  if (list.length < MIN_RECORDS_FOR_INSIGHTS) {
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
    .slice(0, 4);

  return { ready: true, missing: 0, items };
}
