//
// Meta de redução declarada pelo usuário: "quero cair pra X puxadas/dia até
// tal data". É dado de ENTRADA (como o aparelho), não derivado — quem lê e
// grava é obterMeta()/salvarMeta() em utils/storage.js.
//
// Shape persistido (campos em inglês, como todo dado salvo):
//   { baseline, target, startDate: 'YYYY-MM-DD', endDate: 'YYYY-MM-DD' }
//
// A meta do dia é uma RAMPA LINEAR entre baseline e target: quem usa 100 por
// dia não recebe "sua meta é 10" no primeiro dia (o que seria só falhar todo
// dia), e sim uma meta que desce um pouco a cada dia até o alvo.
//
// Este arquivo é puro e não importa missions.js/achievements.js — os dois
// importam daqui, então um import de volta faria ciclo.

import { somarPuxadas, metaDiaria } from './records';
import { deslocarData, diferencaEmDias } from './datas';

function numeroNaoNegativo(valor) {
  const n = Number(valor);
  return !isNaN(n) && n >= 0 ? n : null;
}

function ehDataValida(valor) {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

// deslocarData/diferencaEmDias moram em utils/datas.js (fonte única de data
// local). Reexportadas porque as telas historicamente importam daqui.
export { deslocarData, diferencaEmDias } from './datas';

// Janela móvel: as N datas que terminam em `ateData` (inclusive), em ordem.
export function janelaDeDias(ateData, n) {
  const dias = [];
  for (let i = n - 1; i >= 0; i--) {
    dias.push(deslocarData(ateData, -i));
  }
  return dias;
}

export function metaValida(meta) {
  if (!meta || typeof meta !== 'object') return false;
  const baseline = numeroNaoNegativo(meta.baseline);
  const target = numeroNaoNegativo(meta.target);
  if (baseline === null || target === null || target >= baseline) return false;
  if (!ehDataValida(meta.startDate) || !ehDataValida(meta.endDate)) return false;
  return diferencaEmDias(meta.startDate, meta.endDate) > 0;
}

// Meta de puxadas do dia `data` segundo a rampa. Fora do intervalo fica
// grudada nas pontas: antes do início vale o baseline, depois do fim, o alvo.
export function metaDoDia(meta, data) {
  if (!metaValida(meta)) return null;
  const alvoDeDias = diferencaEmDias(meta.startDate, meta.endDate);
  const passados = Math.min(
    Math.max(diferencaEmDias(meta.startDate, data), 0),
    alvoDeDias
  );
  return meta.baseline - (meta.baseline - meta.target) * (passados / alvoDeDias);
}

// A meta que vale pro app inteiro. É AQUI que "meta do usuário ganha da meta
// do aparelho" acontece — nenhuma tela deve chamar metaDiaria() direto.
export function metaEfetiva(meta, aparelho, data) {
  const daMeta = metaDoDia(meta, data);
  if (daMeta !== null) return daMeta;
  return metaDiaria(aparelho);
}

// Média de puxadas por dia nas datas informadas, contando só os dias que têm
// registro. null quando nenhum dia da janela foi registrado.
export function mediaDiariaNasDatas(registros, datas) {
  const lista = Array.isArray(registros) ? registros : [];
  const alvo = new Set(datas || []);
  const porData = {};
  lista.forEach((registro) => {
    if (!alvo.has(registro.date)) return;
    if (!porData[registro.date]) porData[registro.date] = [];
    porData[registro.date].push(registro);
  });
  const diasComRegistro = Object.values(porData);
  if (diasComRegistro.length === 0) return null;
  const total = diasComRegistro.reduce((soma, doDia) => soma + somarPuxadas(doDia), 0);
  return total / diasComRegistro.length;
}

// Tudo o que o card da Home precisa numa chamada só.
export function progressoDaMeta(meta, registros, hoje) {
  if (!metaValida(meta)) return null;
  const metaDeHoje = metaDoDia(meta, hoje);
  const usadasHoje = somarPuxadas(
    (Array.isArray(registros) ? registros : []).filter((r) => r.date === hoje)
  );
  const totalDeDias = diferencaEmDias(meta.startDate, meta.endDate);
  const passados = Math.min(Math.max(diferencaEmDias(meta.startDate, hoje), 0), totalDeDias);
  return {
    metaDeHoje,
    usadasHoje,
    dentroDaMeta: usadasHoje <= metaDeHoje,
    diasRestantes: Math.max(0, diferencaEmDias(hoje, meta.endDate)),
    percentualDoTempo: Math.round((passados / totalDeDias) * 100),
  };
}
