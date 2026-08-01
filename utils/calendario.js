//
// Funções PURAS de calendário — igual utils/records.js e utils/meta.js, não
// leem nem escrevem nada. Servem tanto ao heatmap de dias limpos da Home
// quanto ao seletor de intervalo do Histórico.
//
// Toda data aqui é a string 'YYYY-MM-DD' que já é o formato do campo `date`
// do registro. O parse sempre passa por converterDataLocal (meio-dia), que é
// o que evita o off-by-one de fuso.

import { converterDataLocal, chaveDeData } from './datas';
import { somarPuxadas } from './records';

export { chaveDeData };

export const MESES_CURTOS = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

export const MESES_POR_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

// Semana começando na segunda, mesma convenção de chaveDoInicioDaSemana
// (HistoryScreen). Sábado e domingo ficam no fim.
export const DIAS_DA_SEMANA_CURTOS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

export function mesDeData(dataStr) {
  const data = converterDataLocal(dataStr);
  return { ano: data.getFullYear(), mes: data.getMonth() };
}

export function mesAnterior({ ano, mes }) {
  return mes === 0 ? { ano: ano - 1, mes: 11 } : { ano, mes: mes - 1 };
}

export function mesSeguinte({ ano, mes }) {
  return mes === 11 ? { ano: ano + 1, mes: 0 } : { ano, mes: mes + 1 };
}

// Grade de 7 colunas: `null` nas casas vazias antes do dia 1, depois uma
// string de data por dia do mês. Quem renderiza só quebra de 7 em 7.
export function gradeDoMes(ano, mes) {
  const primeiroDia = new Date(ano, mes, 1);
  const diaDaSemana = primeiroDia.getDay();
  // getDay() devolve 0 para domingo; a grade começa na segunda.
  const casasVazias = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  const totalDeDias = new Date(ano, mes + 1, 0).getDate();

  const celulas = new Array(casasVazias).fill(null);
  for (let dia = 1; dia <= totalDeDias; dia += 1) {
    celulas.push(chaveDeData(ano, mes, dia));
  }
  return celulas;
}

export function formatarDataCompleta(dataStr) {
  const data = converterDataLocal(dataStr);
  return `${data.getDate()} de ${MESES_POR_EXTENSO[data.getMonth()]} de ${data.getFullYear()}`;
}

export function formatarDiaMes(dataStr) {
  const data = converterDataLocal(dataStr);
  return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}`;
}

export function formatarMesEAno({ ano, mes }) {
  return `${MESES_POR_EXTENSO[mes].charAt(0).toUpperCase()}${MESES_POR_EXTENSO[mes].slice(1)} ${ano}`;
}

// Estado de um dia no heatmap. metaDoDia vem de metaEfetiva() na tela —
// nenhuma tela nem util deve chamar metaDiaria() direto.
export function estadoDoDia(registrosDoDia, metaDoDia = null) {
  const lista = Array.isArray(registrosDoDia) ? registrosDoDia : [];
  if (lista.length === 0) return 'sem_registro';
  if (!lista.some((registro) => registro.used === true)) return 'limpo';
  if (metaDoDia === null || metaDoDia === undefined) return 'usou';
  return somarPuxadas(lista) > metaDoDia ? 'usou_acima' : 'usou_dentro';
}

export function resumoDoMes(registros, ano, mes) {
  const lista = Array.isArray(registros) ? registros : [];
  const resumo = { diasLimpos: 0, diasComUso: 0, diasSemRegistro: 0 };

  gradeDoMes(ano, mes).forEach((dataStr) => {
    if (!dataStr) return;
    const doDia = lista.filter((registro) => registro.date === dataStr);
    if (doDia.length === 0) resumo.diasSemRegistro += 1;
    else if (doDia.some((registro) => registro.used === true)) resumo.diasComUso += 1;
    else resumo.diasLimpos += 1;
  });

  return resumo;
}

// Intervalo inclusivo. Ordena sozinho, então tanto faz a ordem em que o
// usuário tocou as duas pontas no calendário.
export function datasNoIntervalo(inicio, fim) {
  if (!inicio || !fim) return [];
  const [de, ate] = inicio <= fim ? [inicio, fim] : [fim, inicio];
  const datas = [];
  const cursor = converterDataLocal(de);
  const limite = converterDataLocal(ate);

  while (cursor <= limite) {
    datas.push(chaveDeData(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
    cursor.setDate(cursor.getDate() + 1);
  }
  return datas;
}

export function diasNoIntervalo(inicio, fim) {
  if (!inicio || !fim) return 0;
  const [de, ate] = inicio <= fim ? [inicio, fim] : [fim, inicio];
  const ms = converterDataLocal(ate) - converterDataLocal(de);
  return Math.round(ms / 86400000) + 1;
}

export function estaNoIntervalo(dataStr, inicio, fim) {
  if (!inicio || !fim) return false;
  const [de, ate] = inicio <= fim ? [inicio, fim] : [fim, inicio];
  return dataStr >= de && dataStr <= ate;
}
