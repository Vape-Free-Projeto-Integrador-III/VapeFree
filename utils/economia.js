//
// Helpers puros sobre o mapa de economia ({ 'YYYY-MM-DD': valor }). Ficam aqui
// pra tela não reimplementar a soma acumulada — a mesma conta que gera o
// "Total no bolso" tem que gerar o último ponto do gráfico.
//
// Módulo folha: não importa nada de `utils/`.

function valorDoDia(economia, data) {
  const n = Number(economia?.[data]);
  return isNaN(n) ? 0 : n;
}

// Soma tudo que foi economizado antes de `data` (exclusivo). É o ponto de
// partida do acumulado: sem isso o gráfico começaria do zero e contradiria o
// total mostrado no card de economia.
export function economiaAcumuladaAte(economia, data) {
  if (!economia) return 0;
  return Object.keys(economia).reduce(
    (soma, dia) => (dia < data ? soma + valorDoDia(economia, dia) : soma),
    0
  );
}

// Série de economia acumulada nos dias pedidos: cada ponto é o total no bolso
// ao fim daquele dia, incluindo o que veio antes da janela.
// `dias` é uma lista de 'YYYY-MM-DD' em ordem crescente (ex.: ultimosNDias(30)).
export function serieDeEconomiaAcumulada(economia, dias) {
  if (!dias || dias.length === 0) return [];
  let acumulado = economiaAcumuladaAte(economia, dias[0]);
  return dias.map((data) => {
    acumulado += valorDoDia(economia, data);
    return { data, acumulado: parseFloat(acumulado.toFixed(2)) };
  });
}

// Quanto a série ganhou do primeiro ao último ponto — o que foi economizado
// dentro da janela, sem contar a base anterior.
export function ganhoDaSerie(serie) {
  if (!serie || serie.length === 0) return 0;
  const inicio = serie[0].acumulado;
  const fim = serie[serie.length - 1].acumulado;
  return parseFloat((fim - inicio).toFixed(2));
}

// Rótulos 'DD/MM' com no máximo `maximo` visíveis — os demais viram string
// vazia. Com 30 pontos o chart-kit sobrepõe as datas se todas forem escritas.
export function rotulosEspacados(dias, maximo = 5) {
  if (!dias || dias.length === 0) return [];
  // Conta a partir do fim: o último dia é sempre escrito e os outros ficam
  // espaçados a partir dele, senão o penúltimo rótulo colaria no último.
  const passo = Math.max(1, Math.ceil(dias.length / maximo));
  return dias.map((data, indice) => {
    if ((dias.length - 1 - indice) % passo !== 0) return '';
    const [, mes, dia] = data.split('-');
    return `${dia}/${mes}`;
  });
}
