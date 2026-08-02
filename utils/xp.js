//
// XP e nível do usuário. O XP é SEMPRE derivado dos dados que já existem
// (registros, conquistas desbloqueadas, streak) — não é um contador que
// vai sendo somado a cada ação. Isso evita XP duplicado (registro editado,
// tela recarregada) e XP perdido (ação feita offline / em outro aparelho).
//
// O par obterEstadoDeXp/salvarEstadoDeXp em storage.js guarda só um snapshot
// do último valor calculado, pra quem precisar do XP sem recalcular tudo.

import { CONQUISTAS } from './achievements';
import { deslocarData, inicioDaSemana } from './datas';

export const REGRAS_DE_XP = {
    REGISTRO: 10, // por registro feito
    DIA_LIMPO: 30, // por dia registrado sem usar o vape
    SEMANA_STREAK: 100, // bônus por cada 7 dias seguidos sem usar
};

export const NIVEIS = [
    { nome: 'Iniciante', icone: '🌱', minimo: 0, maximo: 1000 },
    { nome: 'Resistente', icone: '🛡️', minimo: 1000, maximo: 2500 },
    { nome: 'Guerreiro', icone: '⚔️', minimo: 2500, maximo: 5000 },
    { nome: 'Campeão', icone: '🏆', minimo: 5000, maximo: 10000 },
    { nome: 'Lendário', icone: '👑', minimo: 10000, maximo: Infinity },
];

// Maior sequência de dias seguidos sem usar já feita (não só a atual) —
// assim quebrar o streak não faz o usuário perder XP que já conquistou.
export function calcularMelhorStreak(registros) {
    if (!Array.isArray(registros) || registros.length === 0) return 0;

    const porData = {};
    registros.forEach((registro) => {
        if (!porData[registro.date]) porData[registro.date] = [];
        porData[registro.date].push(registro);
    });

    const datas = Object.keys(porData).sort();
    let melhor = 0;
    let atual = 0;
    let anterior = null;

    for (const data of datas) {
        const limpo = porData[data].every((registro) => !registro.used);
        const consecutivo = anterior !== null && ehDiaSeguinte(anterior, data);

        if (limpo) {
            atual = consecutivo ? atual + 1 : 1;
            melhor = Math.max(melhor, atual);
        } else {
            atual = 0;
        }
        anterior = data;
    }

    return melhor;
}

function ehDiaSeguinte(dataAnterior, data) {
    return deslocarData(dataAnterior, 1) === data;
}

export function contarDiasLimpos(registros) {
    if (!Array.isArray(registros) || registros.length === 0) return 0;

    const porData = {};
    registros.forEach((registro) => {
        if (!porData[registro.date]) porData[registro.date] = [];
        porData[registro.date].push(registro);
    });

    return Object.values(porData).filter((registrosDoDia) =>
        registrosDoDia.every((registro) => !registro.used)
    ).length;
}

// Id da entrada de resumo das missões já consolidadas (ver o bloco de missões
// em utils/storage.js, que importa esta constante daqui). Ela mora na mesma
// lista das missões cruas e tem `xp` próprio — a soma abaixo depende disso.
export const ID_DO_RESUMO_DE_MISSOES = '_resumo';

// ─── Marca d'água do resumo de missões ──────────────────────────────────────
//
// O resumo (`_resumo`, ver o bloco de missões em utils/storage.js) carrega o xp
// de todo período já fechado, e `until` é o maior `periodKey` que ele conta —
// é o que impede uma entrada crua que ressuscite no servidor (delete que não
// pegou) de somar XP duas vezes.
//
// `until` é UM VALOR POR TIPO DE PERÍODO, e não uma string só. Tem que ser:
// `periodKey` de missão diária é qualquer dia, e o de semanal é a segunda-feira
// daquela semana. Com uma marca única, as diárias — que fecham todos os dias —
// empurravam `until` pra frente e em dois dias ele já passava da segunda-feira
// da semana CORRENTE. A semanal daquela semana, ainda aberta, passava a ser
// lida como "já contada": o xp dela sumia da soma no meio da semana (o total na
// Home caía sozinho, o nível podia até regredir) e na consolidação seguinte a
// entrada era apagada sem nunca entrar no resumo. Separado por período, uma
// nunca mais mexe na marca da outra.
const PERIODOS = ['daily', 'weekly'];
const FORMATO_DE_DATA = /^\d{4}-\d{2}-\d{2}$/;

export const LIMITE_VAZIO = { daily: '', weekly: '' };

// O `period` da entrada, ou null quando ela não tem o campo (formato antigo).
// null não é "diária": sem saber o tipo não dá pra dizer qual marca a cobre,
// então quem chama trata esse caso como "nunca contada" — perder XP é pior que
// o risco de contar duas vezes, mesma escolha do resto deste arquivo.
export function periodoDaEntrada(entrada) {
    return PERIODOS.includes(entrada?.period) ? entrada.period : null;
}

// Lê o `until` do resumo já normalizado em { daily, weekly }.
export function limiteDoResumo(resumo) {
    const until = resumo?.until;

    if (until && typeof until === 'object') {
        return {
            daily: typeof until.daily === 'string' ? until.daily : '',
            weekly: typeof until.weekly === 'string' ? until.weekly : '',
        };
    }

    if (typeof until !== 'string' || !FORMATO_DE_DATA.test(until)) {
        return { ...LIMITE_VAZIO };
    }

    // Resumo no formato antigo (string única). Como as diárias fechavam todo
    // dia, na prática essa string É a marca das diárias — pra elas ela vale
    // como está. Pra semanal ela está adiantada (era exatamente o bug), então
    // volta uma semana: a semanal engolida por ele volta a poder ser contada.
    // O risco de contar duas vezes aqui exige que o delete dela também tenha
    // falhado — raro, e menos grave que continuar comendo o XP de todo mundo.
    return { daily: until, weekly: deslocarData(inicioDaSemana(until), -7) };
}

// A entrada crua já está embutida no xp do resumo?
export function jaEstaNoResumo(entrada, limite) {
    const periodo = periodoDaEntrada(entrada);
    if (periodo === null || entrada?.periodKey == null) return false;
    const contadoAte = limite?.[periodo];
    return !!contadoAte && String(entrada.periodKey) <= contadoAte;
}

// Marca nova depois de consolidar `fechadas`: cada período avança só pela maior
// `periodKey` do PRÓPRIO tipo.
export function avancarLimite(limite, fechadas) {
    const novo = { ...LIMITE_VAZIO, ...limite };
    for (const entrada of fechadas || []) {
        const periodo = periodoDaEntrada(entrada);
        if (periodo === null || entrada?.periodKey == null) continue;
        const chave = String(entrada.periodKey);
        if (chave > novo[periodo]) novo[periodo] = chave;
    }
    return novo;
}

// A entrada de resumo soma o próprio xp; as cruas somam só se ainda não
// estiverem embutidas nele. Entrada sem `periodKey` ou sem `period` (formato
// antigo) continua somando — ver periodoDaEntrada.
function somarXpDeMissoes(missoesConcluidas) {
    const lista = missoesConcluidas || [];
    const resumo = lista.find((missao) => missao?.id === ID_DO_RESUMO_DE_MISSOES);
    const limite = limiteDoResumo(resumo);

    return lista.reduce((soma, missao) => {
        if (missao !== resumo && jaEstaNoResumo(missao, limite)) return soma;
        return soma + (missao?.xp || 0);
    }, 0);
}

// conquistasDesbloqueadas: array [{ id, unlockedAt }] vindo de obterConquistas().
// missoesConcluidas: array [{ id, missionId, xp, completedAt }] vindo de
// obterMissoes(). Aqui usamos o xp gravado na própria entrada (e não o valor
// atual em MISSOES) pra que mudar a tabela de missões não reescreva XP que
// o usuário já ganhou.
export function calcularXp(registros = [], conquistasDesbloqueadas = [], missoesConcluidas = []) {
    const xpDeRegistros = (registros?.length || 0) * REGRAS_DE_XP.REGISTRO;
    const xpDeDiasLimpos = contarDiasLimpos(registros) * REGRAS_DE_XP.DIA_LIMPO;
    const xpDeStreak = Math.floor(calcularMelhorStreak(registros) / 7) * REGRAS_DE_XP.SEMANA_STREAK;

    const xpPorId = new Map(CONQUISTAS.map((c) => [c.id, c.xp || 0]));
    const xpDeConquistas = (conquistasDesbloqueadas || []).reduce(
        (soma, conquista) => soma + (xpPorId.get(conquista.id) || 0),
        0
    );

    const xpDeMissoes = somarXpDeMissoes(missoesConcluidas);

    return xpDeRegistros + xpDeDiasLimpos + xpDeStreak + xpDeConquistas + xpDeMissoes;
}

export function obterNivel(xp = 0) {
    // XP abaixo do primeiro nível não existe pela UI hoje, mas se aparecer
    // (qualquer parcela descontada) tem que virar piso, não estourar pro topo
    // nem gerar progresso/faltante negativo — daí clampar antes de tudo.
    const xpClampado = Math.max(xp, NIVEIS[0].minimo);
    const indiceEncontrado = NIVEIS.findIndex(
        (nivel) => xpClampado >= nivel.minimo && xpClampado < nivel.maximo
    );
    const indice = indiceEncontrado === -1 ? NIVEIS.length - 1 : indiceEncontrado;
    const nivel = NIVEIS[indice];
    const ehMaximo = nivel.maximo === Infinity;

    return {
        indice,
        numero: indice + 1,
        nome: nivel.nome,
        icone: nivel.icone,
        minimo: nivel.minimo,
        maximo: nivel.maximo,
        xpNoNivel: xpClampado - nivel.minimo,
        xpDoNivel: ehMaximo ? 0 : nivel.maximo - nivel.minimo,
        xpParaProximo: ehMaximo ? 0 : nivel.maximo - xpClampado,
        nomeDoProximo: ehMaximo ? null : NIVEIS[indice + 1].nome,
        progresso: ehMaximo ? 1 : (xpClampado - nivel.minimo) / (nivel.maximo - nivel.minimo),
    };
}

// Atalho pra quem tem registros + conquistas + missões em mãos e quer tudo
// de uma vez.
export function resumoDeXp(registros = [], conquistasDesbloqueadas = [], missoesConcluidas = []) {
    const xp = calcularXp(registros, conquistasDesbloqueadas, missoesConcluidas);
    return { xp, nivel: obterNivel(xp) };
}
