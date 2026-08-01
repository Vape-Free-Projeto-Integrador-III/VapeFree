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

// Limite de puxadas usado pelo cálculo da economia. Igual a metaEfetiva, mas
// só a partir de meta.startDate: antes disso a meta ainda não existia, e
// metaDoDia gruda no baseline fora do intervalo — usar isso no passado
// inflaria a economia já registrada.
export function limiteDoDia(meta, aparelho, data) {
  if (metaValida(meta) && diferencaEmDias(meta.startDate, data) < 0) {
    return metaDiaria(aparelho);
  }
  return metaEfetiva(meta, aparelho, data);
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

// Quantos dias da janela têm registro. A média ignora dia sem registro, então
// quem compara duas janelas precisa saber com quantos dias cada média foi
// feita — comparar 7 dias com 1 dia isolado dá um número enganoso.
function diasRegistradosNasDatas(registros, datas) {
  const alvo = new Set(datas || []);
  return new Set(
    (Array.isArray(registros) ? registros : [])
      .filter((registro) => alvo.has(registro.date))
      .map((registro) => registro.date)
  ).size;
}

// Diferença de média diária considerada empate. Menos de meia puxada por dia
// não é tendência — é ruído de arredondamento do próprio registro.
const TOLERANCIA_DE_EMPATE = 0.5;

// Comparativo "esta semana x semana passada" da média diária de puxadas.
// `direcao` é null quando falta registro em alguma das janelas — aí não há
// comparação a fazer e a UI mostra o convite pra registrar. `percentual` é
// null quando a semana anterior fechou em zero (queda/alta de 0 não tem %).
export function comparativoSemanal(registros, hoje) {
  const datasAtuais = janelaDeDias(hoje, 7);
  const datasAnteriores = janelaDeDias(deslocarData(hoje, -7), 7);
  const mediaAtual = mediaDiariaNasDatas(registros, datasAtuais);
  const mediaAnterior = mediaDiariaNasDatas(registros, datasAnteriores);
  const base = {
    mediaAtual,
    mediaAnterior,
    diasAtuais: diasRegistradosNasDatas(registros, datasAtuais),
    diasAnteriores: diasRegistradosNasDatas(registros, datasAnteriores),
  };
  if (mediaAtual === null || mediaAnterior === null) {
    return { ...base, diferenca: null, percentual: null, direcao: null };
  }
  const diferenca = mediaAtual - mediaAnterior;
  let direcao = 'estavel';
  if (diferenca <= -TOLERANCIA_DE_EMPATE) direcao = 'queda';
  if (diferenca >= TOLERANCIA_DE_EMPATE) direcao = 'alta';
  return {
    ...base,
    diferenca,
    percentual: mediaAnterior > 0 ? (diferenca / mediaAnterior) * 100 : null,
    direcao,
  };
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
