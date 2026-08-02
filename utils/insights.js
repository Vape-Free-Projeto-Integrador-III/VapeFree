//
// Funções PURAS de derivação — igual utils/achievements.js, não leem nem
// escrevem nada. Recebem a lista de registros e devolvem os padrões que o
// usuário consegue enxergar sobre si mesmo (gatilho mais comum, dia da
// semana crítico, etc.).
//
// Nada aqui usa o campo "time" do registro: ele guarda a hora em que o
// formulário foi salvo, não a hora em que a pessoa usou o vape (o registro
// pode ser retroativo pelo date picker). Insight de horário sairia errado.

import { puxadasDoRegistro } from './records';
import { GATILHOS, AJUDAS } from './theme';
import { converterDataLocal } from './datas';

export const MIN_REGISTROS_PARA_INSIGHTS = 7;

const EMOJI_PADRAO = '📌';
// Domingo e sábado são masculinos ("aos domingos"), o resto é feminino
// ("às segundas-feiras") — por isso a preposição vem junto do rótulo.
const DIAS_DA_SEMANA = [
    'aos domingos',
    'às segundas-feiras',
    'às terças-feiras',
    'às quartas-feiras',
    'às quintas-feiras',
    'às sextas-feiras',
    'aos sábados',
];

// O Slider às vezes entrega a intensidade como array ([n]) em vez de número.
export function normalizarIntensidade(valor) {
    const bruto = Array.isArray(valor) ? valor[0] : valor;
    return Number(bruto) || 0;
}

// converterDataLocal mora em utils/datas.js (fonte única de data local).
// Reexportada porque HistoryScreen e calendario.js importam daqui.
export { converterDataLocal } from './datas';

export function emojiDoRotulo(rotulo) {
    const encontrado =
        GATILHOS.find((g) => g.rotulo === rotulo) || AJUDAS.find((a) => a.rotulo === rotulo);
    return encontrado ? encontrado.emoji : EMOJI_PADRAO;
}

function contarRotulos(registros, campo) {
    const contagens = {};
    registros.forEach((registro) => {
        (registro[campo] || []).forEach((rotulo) => {
            contagens[rotulo] = (contagens[rotulo] || 0) + 1;
        });
    });
    return contagens;
}

function maiorContagem(contagens) {
    const entradas = Object.entries(contagens);
    if (entradas.length === 0) return null;
    entradas.sort((a, b) => b[1] - a[1]);
    return { rotulo: entradas[0][0], contagem: entradas[0][1] };
}

function gatilhoMaisComum(registrosComUso) {
    const topo = maiorContagem(contarRotulos(registrosComUso, 'triggers'));
    if (!topo || registrosComUso.length === 0) return null;

    const porcentagem = Math.round((topo.contagem / registrosComUso.length) * 100);
    return {
        id: 'trigger_comum',
        rotulo: topo.rotulo,
        icone: emojiDoRotulo(topo.rotulo),
        titulo: `Seu gatilho mais comum é ${topo.rotulo}`,
        detalhe: `Aparece em ${porcentagem}% dos dias em que você usou.`,
    };
}

// Só o rótulo do gatilho mais comum — usado pela tela de crise para a
// mensagem personalizada, sem precisar do pacote inteiro de insights.
export function gatilhoMaisFrequente(registros) {
    const comUso = (Array.isArray(registros) ? registros : []).filter((r) => r.used);
    const topo = maiorContagem(contarRotulos(comUso, 'triggers'));
    return topo ? topo.rotulo : null;
}

// Um único registro num dia da semana não é padrão, é coincidência.
export const MIN_REGISTROS_PARA_DIA_DE_RISCO = 2;

// O dia da semana em que a pessoa mais usa, com a média de puxadas dele.
// `dia` segue Date.getDay() (0 = domingo).
//
// Como horarioDeRiscoDeCrise, alimenta tanto o insight `dia_semana` (texto)
// quanto o lembrete semanal agendado nesse dia (utils/notifications.js) — os
// dois olham o mesmo dado, então nunca divergem.
export function diaDeRiscoDaSemana(registros) {
    const lista = Array.isArray(registros) ? registros : [];
    const porDiaDaSemana = {};
    lista.forEach((registro) => {
        const dia = converterDataLocal(registro.date).getDay();
        if (!porDiaDaSemana[dia]) porDiaDaSemana[dia] = { total: 0, contagem: 0 };
        porDiaDaSemana[dia].total += puxadasDoRegistro(registro);
        porDiaDaSemana[dia].contagem += 1;
    });

    const candidatos = Object.entries(porDiaDaSemana)
        .filter(([, { contagem }]) => contagem >= MIN_REGISTROS_PARA_DIA_DE_RISCO)
        .map(([dia, { total, contagem }]) => ({
            dia: Number(dia),
            contagem,
            media: total / contagem,
        }))
        .filter(({ media }) => media > 0);

    if (candidatos.length === 0) return null;

    candidatos.sort((a, b) => b.media - a.media);
    const topo = candidatos[0];
    return { ...topo, rotulo: DIAS_DA_SEMANA[topo.dia] };
}

function diaDaSemanaMaisArriscado(registros) {
    const topo = diaDeRiscoDaSemana(registros);
    if (!topo) return null;

    return {
        id: 'dia_semana',
        icone: '📅',
        titulo: `Você usa mais ${topo.rotulo}`,
        detalhe: `Média de ${Math.round(topo.media)} puxadas nesse dia da semana.`,
    };
}

function gatilhoMaisIntenso(registrosComUso) {
    const estatisticas = {};
    registrosComUso.forEach((registro) => {
        const intensidade = normalizarIntensidade(registro.intensity);
        (registro.triggers || []).forEach((rotulo) => {
            if (!estatisticas[rotulo]) estatisticas[rotulo] = { total: 0, contagem: 0 };
            estatisticas[rotulo].total += intensidade;
            estatisticas[rotulo].contagem += 1;
        });
    });

    const candidatos = Object.entries(estatisticas)
        .filter(([, { contagem }]) => contagem >= 2)
        .map(([rotulo, { total, contagem }]) => ({ rotulo, media: total / contagem }));

    if (candidatos.length === 0) return null;

    candidatos.sort((a, b) => b.media - a.media);
    const topo = candidatos[0];
    return {
        id: 'gatilho_intenso',
        rotulo: topo.rotulo,
        icone: '🔥',
        titulo: `${topo.rotulo} é o que te dá mais vontade`,
        detalhe: `Nesses dias sua vontade média é ${(Math.round(topo.media * 10) / 10)
            .toFixed(1)
            .replace('.', ',')}/10.`,
    };
}

function ajudaQueMaisFunciona(registrosSemUso) {
    const topo = maiorContagem(contarRotulos(registrosSemUso, 'helps'));
    if (!topo) return null;

    return {
        id: 'ajuda',
        icone: emojiDoRotulo(topo.rotulo),
        titulo: `${topo.rotulo} é o que mais te ajuda`,
        detalhe: `Apareceu em ${topo.contagem} ${topo.contagem === 1 ? 'dia' : 'dias'} sem usar.`,
    };
}

// ─── Modo crise ──────────────────────────────────────────────────────────────

export const METODOS_DE_CRISE = {
    respiracao: { rotulo: 'Respiração guiada', emoji: '🧘' },
    timer: { rotulo: 'Aguentar alguns minutos', emoji: '⏱️' },
    distracao: { rotulo: 'Distrações rápidas', emoji: '💧' },
};

// Sem julgamento no "usei" — o app não pune, só registra. Fonte única do
// rótulo do desfecho: o CrisisOutcomeModal oferece e a tela de histórico de
// crises exibe a partir daqui.
export const DESFECHOS_DE_CRISE = [
    { id: 'passou', rotulo: 'Passou', emoji: '💚' },
    { id: 'diminuiu', rotulo: 'Diminuiu', emoji: '🙂' },
    { id: 'usei', rotulo: 'Acabei usando', emoji: '😔' },
];

export function desfechoDeCrise(id) {
    return DESFECHOS_DE_CRISE.find((d) => d.id === id) || null;
}

// Resumo de topo da tela de histórico de crises. Mesma regra de
// taxaDeSucessoNasCrises: superada = respondida e diferente de "usei".
export function resumoDeCrises(sessoes) {
    const lista = Array.isArray(sessoes) ? sessoes : [];
    const respondidas = lista.filter((s) => s.outcome);
    const superadas = respondidas.filter((s) => s.outcome !== 'usei');
    return {
        total: lista.length,
        respondidas: respondidas.length,
        superadas: superadas.length,
        taxa:
            respondidas.length > 0
                ? Math.round((superadas.length / respondidas.length) * 100)
                : null,
    };
}

// "Passou" vale 1, "diminuiu" vale meio ponto — diminuir também é vitória,
// só não do mesmo tamanho. "usei" vale 0.
const PESO_DO_DESFECHO = { passou: 1, diminuiu: 0.5, usei: 0 };

// Qual método já funcionou melhor PRA ESTE usuário. Só considera método com
// pelo menos 2 sessões avaliadas — uma sessão é sorte, não padrão (mesma
// regra de diaDaSemanaMaisArriscado e gatilhoMaisIntenso).
export function metodoDeCriseRecomendado(sessoes) {
    const lista = Array.isArray(sessoes) ? sessoes : [];
    const estatisticas = {};

    lista.forEach((sessao) => {
        const peso = PESO_DO_DESFECHO[sessao.outcome];
        if (peso === undefined || !METODOS_DE_CRISE[sessao.method]) return;
        if (!estatisticas[sessao.method]) estatisticas[sessao.method] = { total: 0, contagem: 0 };
        estatisticas[sessao.method].total += peso;
        estatisticas[sessao.method].contagem += 1;
    });

    const candidatos = Object.entries(estatisticas)
        .filter(([, { contagem }]) => contagem >= 2)
        .map(([metodo, { total, contagem }]) => ({ metodo, taxaDeSucesso: total / contagem }))
        .filter(({ taxaDeSucesso }) => taxaDeSucesso > 0);

    if (candidatos.length === 0) return null;

    candidatos.sort((a, b) => b.taxaDeSucesso - a.taxaDeSucesso);
    return candidatos[0];
}

// Períodos do dia. Diferente do campo "time" do registro (que é a hora em
// que o formulário foi salvo), o "time" da sessão de crise é a hora real em
// que a vontade bateu — então aqui insight de horário faz sentido.
const PERIODOS_DO_DIA = [
    { id: 'madrugada', rotulo: 'de madrugada', de: 0, ate: 5 },
    { id: 'manha', rotulo: 'de manhã', de: 6, ate: 11 },
    { id: 'tarde', rotulo: 'à tarde', de: 12, ate: 17 },
    { id: 'noite', rotulo: 'à noite', de: 18, ate: 23 },
];

// Hora cheia de um `time` de sessão de crise ('HH:MM'). Exige os dois dígitos:
// `Number('')` é 0, então sem essa checagem sessão sem hora viraria meia-noite
// (e contaria como madrugada).
function horaDe(horaStr) {
    const texto = String(horaStr || '');
    if (!/^\d{2}/.test(texto)) return null;
    return Number(texto.slice(0, 2));
}

function periodoDe(horaStr) {
    const hora = horaDe(horaStr);
    if (hora === null) return null;
    return PERIODOS_DO_DIA.find((p) => hora >= p.de && hora <= p.ate) || null;
}

function totalDeCrisesSuperadas(sessoes) {
    const superadas = sessoes.filter((s) => s.outcome === 'passou' || s.outcome === 'diminuiu');
    if (superadas.length < 2) return null;

    return {
        id: 'crise_superadas',
        icone: '🛟',
        titulo: `Você superou ${superadas.length} ${superadas.length === 1 ? 'crise' : 'crises'}`,
        detalhe: `Foram ${sessoes.length} ${sessoes.length === 1 ? 'vez' : 'vezes'} que você abriu o modo crise em vez de simplesmente usar.`,
    };
}

function melhorMetodoDeCrise(sessoes) {
    const melhor = metodoDeCriseRecomendado(sessoes);
    if (!melhor) return null;

    const porcentagem = Math.round(melhor.taxaDeSucesso * 100);
    return {
        id: 'crise_metodo',
        icone: METODOS_DE_CRISE[melhor.metodo].emoji,
        titulo: `${METODOS_DE_CRISE[melhor.metodo].rotulo} é o que mais te segura`,
        detalhe: `Nas crises em que você usou esse método, ${porcentagem}% terminaram sem uso ou com a vontade menor.`,
    };
}

function taxaDeSucessoNasCrises(sessoes) {
    const respondidas = sessoes.filter((s) => s.outcome);
    if (respondidas.length < 3) return null;

    const seguradas = respondidas.filter((s) => s.outcome !== 'usei');
    const porcentagem = Math.round((seguradas.length / respondidas.length) * 100);
    if (porcentagem === 0) return null;

    return {
        id: 'crise_taxa',
        icone: '💪',
        titulo: `Você aguenta ${porcentagem}% das crises`,
        detalhe: `${seguradas.length} de ${respondidas.length} vezes a vontade passou ou diminuiu sem você usar.`,
    };
}

// Menos de 3 crises no mesmo período é coincidência, não horário de risco.
export const MIN_CRISES_PARA_HORARIO_DE_RISCO = 3;

// O período do dia em que a vontade mais bate, já convertido num horário
// concreto: a MEDIANA das horas das crises daquele período. Mediana e não
// média porque uma crise perdida na ponta do período (ex.: 23h num monte de
// crises às 18h) não deve arrastar o horário.
//
// É o que alimenta tanto o insight `crise_horario` (texto) quanto o lembrete
// agendado no horário de risco (utils/notifications.js) — os dois olham o
// mesmo dado, então nunca divergem.
export function horarioDeRiscoDeCrise(sessoesDeCrise) {
    const sessoes = Array.isArray(sessoesDeCrise) ? sessoesDeCrise : [];

    const contagens = {};
    sessoes.forEach((sessao) => {
        const periodo = periodoDe(sessao.time);
        if (periodo) contagens[periodo.id] = (contagens[periodo.id] || 0) + 1;
    });

    const topo = maiorContagem(contagens);
    if (!topo || topo.contagem < MIN_CRISES_PARA_HORARIO_DE_RISCO) return null;

    const periodo = PERIODOS_DO_DIA.find((p) => p.id === topo.rotulo);
    const horas = sessoes
        .map((sessao) => horaDe(sessao.time))
        .filter((hora) => hora !== null && hora >= periodo.de && hora <= periodo.ate)
        .sort((a, b) => a - b);

    return {
        periodo: periodo.id,
        rotulo: periodo.rotulo,
        contagem: topo.contagem,
        // Índice de baixo no empate par: prefere a hora mais cedo, e o lembrete
        // chegar cedo demais atrapalha menos que chegar depois da crise.
        hora: horas[Math.floor((horas.length - 1) / 2)],
    };
}

function periodoDasCrises(sessoes) {
    const risco = horarioDeRiscoDeCrise(sessoes);
    if (!risco) return null;

    return {
        id: 'crise_horario',
        icone: '🕒',
        titulo: `Sua vontade bate mais ${risco.rotulo}`,
        detalhe: `${risco.contagem} das suas crises começaram nesse período. Vale se preparar antes dessa hora.`,
    };
}

// Insights do modo crise. Não dependem de MIN_REGISTROS_PARA_INSIGHTS: quem
// usou o modo crise já gerou dado próprio, mesmo com poucos registros.
export function calcularInsightsDeCrise(sessoesDeCrise) {
    const sessoes = Array.isArray(sessoesDeCrise) ? sessoesDeCrise : [];
    if (sessoes.length === 0) return [];

    return [
        totalDeCrisesSuperadas(sessoes),
        taxaDeSucessoNasCrises(sessoes),
        melhorMetodoDeCrise(sessoes),
        periodoDasCrises(sessoes),
    ].filter(Boolean);
}

export function calcularInsights(registros, sessoesDeCrise = []) {
    const lista = Array.isArray(registros) ? registros : [];
    const itensDeCrise = calcularInsightsDeCrise(sessoesDeCrise);

    if (lista.length < MIN_REGISTROS_PARA_INSIGHTS) {
        // Ainda sem registros suficientes pros padrões de uso, mas se já tem
        // insight de crise vale mostrar em vez de esconder tudo.
        if (itensDeCrise.length > 0) {
            return {
                pronto: true,
                faltam: MIN_REGISTROS_PARA_INSIGHTS - lista.length,
                itens: itensDeCrise,
            };
        }
        return { pronto: false, faltam: MIN_REGISTROS_PARA_INSIGHTS - lista.length, itens: [] };
    }

    const registrosComUso = lista.filter((r) => r.used);
    const registrosSemUso = lista.filter((r) => !r.used);

    const comum = gatilhoMaisComum(registrosComUso);
    let maisIntenso = gatilhoMaisIntenso(registrosComUso);

    // Se o gatilho mais intenso for o mesmo que o mais comum, as duas linhas
    // dizem quase a mesma coisa — fica só a primeira.
    if (comum && maisIntenso && comum.rotulo === maisIntenso.rotulo) {
        maisIntenso = null;
    }

    const itens = [
        comum,
        diaDaSemanaMaisArriscado(lista),
        maisIntenso,
        ajudaQueMaisFunciona(registrosSemUso),
    ]
        .filter(Boolean)
        .slice(0, 4)
        .concat(itensDeCrise);

    return { pronto: true, faltam: 0, itens };
}
