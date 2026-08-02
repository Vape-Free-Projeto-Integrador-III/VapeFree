//
// Meta de dinheiro declarada pelo usuário: "quero juntar R$ X". É dado de
// ENTRADA (como a meta de redução e o aparelho), não derivado — quem lê e grava
// é obterMetaDeDinheiro()/salvarMetaDeDinheiro() em utils/storage.js.
//
// Shape persistido (campos em inglês, como todo dado salvo):
//   { amount, label, createdAt }
// `createdAt` é INSTANTE (toISOString completo, como unlockedAt), não dia de
// calendário — não entra em nenhuma conta, serve de registro/exportação.
//
// Diferença proposital pra utils/meta.js: aqui NÃO existe prazo. A meta de
// redução é uma restrição com data final; a meta de dinheiro é uma recompensa,
// e a data de chegada é ESTIMADA pelo ritmo recente. Meta de dinheiro nunca
// vira fracasso — no pior caso a estimativa some.
//
// O acumulado é o total no bolso desde sempre, não só o que veio depois de
// criar a meta: o card mostra "Total R$ 180" logo acima da barra, e uma barra
// zerada ali embaixo se contradiria com ele.

import { totalEconomizado } from './economia';
import { deslocarData } from './datas';
import { janelaDeDias } from './meta';

// Janela padrão do ritmo. Uma semana é curta demais (uma recaída de dois dias
// derruba a estimativa inteira); um mês demora demais pra reagir a melhora.
const JANELA_DO_RITMO = 14;

// Acima disso a estimativa não é informação, é desânimo: quem economiza
// centavos por dia não precisa saber que faltam 40 anos.
const DIAS_ABSURDOS = 3650;

export function metaDeDinheiroValida(metaDeDinheiro) {
    if (!metaDeDinheiro || typeof metaDeDinheiro !== 'object') return false;
    const alvo = Number(metaDeDinheiro.amount);
    return !isNaN(alvo) && alvo > 0;
}

// Média diária de economia na janela que termina em `hoje`. Divide pelos dias
// que TÊM entrada, não pelo tamanho da janela — mesma escolha de
// mediaDiariaNasDatas (utils/meta.js): dia sem registro não é dia de economia
// zero, é dia sem dado, e contá-lo como zero afundaria a estimativa de quem
// registra dia sim, dia não. null quando a janela inteira está vazia.
export function ritmoDiario(economia, hoje, janela = JANELA_DO_RITMO) {
    if (!economia) return null;
    const dias = janelaDeDias(hoje, janela);
    let soma = 0;
    let diasComEntrada = 0;
    dias.forEach((data) => {
        const valor = Number(economia[data]);
        if (economia[data] === undefined || isNaN(valor)) return;
        soma += valor;
        diasComEntrada += 1;
    });
    if (diasComEntrada === 0) return null;
    return soma / diasComEntrada;
}

// Tudo o que o card da Home precisa numa chamada só — espelha
// progressoDaMeta() de utils/meta.js.
export function progressoDaMetaDeDinheiro(metaDeDinheiro, economia, hoje) {
    if (!metaDeDinheiroValida(metaDeDinheiro)) return null;

    const alvo = Number(metaDeDinheiro.amount);
    const acumulado = parseFloat(totalEconomizado(economia).toFixed(2));
    const faltando = parseFloat(Math.max(0, alvo - acumulado).toFixed(2));
    const concluida = acumulado >= alvo;
    const ritmo = ritmoDiario(economia, hoje);

    let diasEstimados = null;
    if (concluida) {
        diasEstimados = 0;
    } else if (ritmo !== null && ritmo > 0) {
        const dias = Math.ceil(faltando / ritmo);
        if (dias <= DIAS_ABSURDOS) diasEstimados = dias;
    }

    return {
        alvo,
        label: typeof metaDeDinheiro.label === 'string' ? metaDeDinheiro.label : '',
        acumulado,
        faltando,
        percentual: Math.min(100, Math.round((acumulado / alvo) * 100)),
        concluida,
        ritmoDiario: ritmo,
        diasEstimados,
        // Meta já batida não tem data futura: o dia é hoje, e a UI mostra a
        // celebração no lugar da estimativa.
        dataEstimada:
            diasEstimados === null || diasEstimados === 0
                ? null
                : deslocarData(hoje, diasEstimados),
    };
}
