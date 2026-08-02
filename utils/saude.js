//
// Marcos de saúde por tempo sem usar. Módulo puro: recebe os registros e o
// instante atual, devolve o que o corpo já recuperou e qual é o próximo marco.
//
// De onde vem o relógio: o app só guarda dia de calendário (`date`), não a hora
// da última puxada. Então o tempo limpo é contado da MEIA-NOITE DO DIA SEGUINTE
// ao último dia com `used: true` — um piso conservador (o uso real foi em algum
// momento daquele dia, nunca depois dele). Sem nenhum dia com uso, conta do
// primeiro dia registrado.
//
// Por que não usar o streak: o streak soma dia protegido por escudo, e escudo
// é mecânica de gamificação — o dia protegido TEVE uso. Recuperação do corpo
// não tem escudo, então aqui o relógio zera em todo dia com uso. Pelo mesmo
// motivo, dia sem registro NÃO zera nada: esquecer de registrar não devolve
// nicotina pro sangue.
//
// Fontes dos marcos (cessação de nicotina; a evidência de longo prazo vem
// majoritariamente de estudos com cigarro, que é o corpo de pesquisa que
// existe — por isso os textos falam de nicotina/vias aéreas e não prometem
// número exato de risco):
// - Truth Initiative, "The immediate benefits of quitting smoking or vaping"
//   (queda de batimentos/pressão em ~20 min, oxigenação em ~12 h).
// - Meia-vida da nicotina ~2 h e da cotinina ~16-40 h (farmacocinética padrão)
//   — daí "praticamente fora do sangue" em 24 h e cotinina em ~3 dias.
// - Recuperação de paladar/olfato começando em ~48 h, com renovação completa
//   das papilas gustativas em 10-14 dias.
// - Pico da abstinência nos dias 1-3, sintomas voltando à linha de base em
//   ~10 dias na maioria dos casos.
// - Função pulmonar melhorando até ~30% em 3 meses; cílios pulmonares
//   recuperados por volta de 9 meses.
// - Densidade de receptores nicotínicos (β2*-nAChR) voltando ao nível de não
//   usuários em ~3-12 semanas de abstinência (estudos de PET/SPECT).
// - Risco de doença coronariana em ~metade do de quem usa após 1 ano.
//

import { converterDataLocal } from './datas';

const HORA = 60;
const DIA = 24 * HORA;

// Ordenados do mais cedo pro mais tarde — `calcularMarcosDeSaude` conta com isso.
export const MARCOS_DE_SAUDE = [
    {
        id: 'min_20',
        minutos: 20,
        icone: '💓',
        titulo: '20 minutos',
        beneficio:
            'Seus batimentos e sua pressão arterial começam a cair pro normal — a nicotina é estimulante e sai rápido do sangue.',
    },
    {
        id: 'h_12',
        minutos: 12 * HORA,
        icone: '🩸',
        titulo: '12 horas',
        beneficio:
            'A oxigenação do sangue se normaliza e o nível de nicotina despenca: a meia-vida dela é de cerca de 2 horas.',
    },
    {
        id: 'd_1',
        minutos: DIA,
        icone: '🫀',
        titulo: '1 dia',
        beneficio:
            'A nicotina já está praticamente fora do sangue. A vontade aperta justo por isso — é o corpo estranhando, não uma recaída.',
    },
    {
        id: 'd_2',
        minutos: 2 * DIA,
        icone: '👃',
        titulo: '2 dias',
        beneficio:
            'Paladar e olfato começam a voltar: as terminações nervosas do nariz e da língua se recuperam.',
    },
    {
        id: 'd_3',
        minutos: 3 * DIA,
        icone: '🌬️',
        titulo: '3 dias',
        beneficio:
            'A cotinina (o resto que a nicotina deixa) sai do corpo e o pico da abstinência passa. Respirar fundo já é mais fácil.',
    },
    {
        id: 'd_7',
        minutos: 7 * DIA,
        icone: '😴',
        titulo: '1 semana',
        beneficio:
            'Irritação, dor de cabeça e sono ruim começam a ceder — para a maioria, os sintomas voltam à linha de base por volta do dia 10.',
    },
    {
        id: 'd_14',
        minutos: 14 * DIA,
        icone: '🏃',
        titulo: '2 semanas',
        beneficio:
            'Circulação e fôlego melhoram, e suas papilas gustativas já se renovaram por completo (elas vivem de 10 a 14 dias).',
    },
    {
        id: 'd_30',
        minutos: 30 * DIA,
        icone: '🫁',
        titulo: '1 mês',
        beneficio:
            'Tosse e irritação de garganta diminuem bastante, e as vias aéreas ficam menos inflamadas.',
    },
    {
        id: 'd_90',
        minutos: 90 * DIA,
        icone: '🧠',
        titulo: '3 meses',
        beneficio:
            'A função pulmonar pode chegar a 30% melhor, e os receptores de nicotina no cérebro voltam à densidade de quem nunca usou.',
    },
    {
        id: 'd_180',
        minutos: 180 * DIA,
        icone: '🛡️',
        titulo: '6 meses',
        beneficio:
            'Menos tosse, menos catarro e menos infecção respiratória do que quando você usava.',
    },
    {
        id: 'd_270',
        minutos: 270 * DIA,
        icone: '✨',
        titulo: '9 meses',
        beneficio: 'Os cílios do pulmão — que varrem sujeira das vias aéreas — estão recuperados.',
    },
    {
        id: 'd_365',
        minutos: 365 * DIA,
        icone: '🏆',
        titulo: '1 ano',
        beneficio:
            'Seu risco de doença coronariana cai pra cerca de metade do de quem continuou usando.',
    },
];

// Meia-noite (local) do dia seguinte a `dataStr`.
function inicioDoDiaSeguinte(dataStr) {
    const data = converterDataLocal(dataStr);
    data.setDate(data.getDate() + 1);
    data.setHours(0, 0, 0, 0);
    return data;
}

// Instante a partir do qual o corpo está limpo, ou null quando não dá pra
// saber (sem registro nenhum).
export function inicioDoTempoLimpo(registros) {
    if (!Array.isArray(registros) || registros.length === 0) return null;

    const datasComUso = registros.filter((r) => r.used === true).map((r) => r.date);
    if (datasComUso.length > 0) {
        return inicioDoDiaSeguinte(datasComUso.sort()[datasComUso.length - 1]);
    }

    // Nunca registrou uso: conta do primeiro dia registrado, à meia-noite.
    const primeira = registros.map((r) => r.date).sort()[0];
    const data = converterDataLocal(primeira);
    data.setHours(0, 0, 0, 0);
    return data;
}

// "3 dias", "2 h", "45 min" — a maior unidade que couber, pra contagem
// regressiva do próximo marco.
export function formatarDuracao(minutos) {
    const m = Math.max(0, Math.ceil(minutos));
    if (m < 60) return `${m} min`;
    if (m < DIA) {
        const horas = Math.ceil(m / HORA);
        return `${horas} ${horas === 1 ? 'hora' : 'horas'}`;
    }
    const dias = Math.ceil(m / DIA);
    return `${dias} ${dias === 1 ? 'dia' : 'dias'}`;
}

// Estado dos marcos:
// - pronto: false quando não há registro nenhum (card não aparece).
// - usouHoje: o último dia com uso é o dia de `agora` — o relógio recomeça na
//   virada do dia, então nada foi conquistado ainda.
// - conquistados: marcos já atingidos, do mais antigo pro mais recente.
// - atual: o último conquistado (null antes dos 20 min).
// - proximo: o próximo marco (null quando passou de 1 ano).
// - progresso: 0..1 entre o marco atual e o próximo.
export function calcularMarcosDeSaude(registros, agora = new Date()) {
    const inicio = inicioDoTempoLimpo(registros);
    if (inicio === null) {
        return {
            pronto: false,
            usouHoje: false,
            minutosLimpo: 0,
            conquistados: [],
            atual: null,
            proximo: MARCOS_DE_SAUDE[0],
            progresso: 0,
            faltamMinutos: MARCOS_DE_SAUDE[0].minutos,
        };
    }

    const minutosLimpo = Math.max(0, (agora - inicio) / 60000);
    const conquistados = MARCOS_DE_SAUDE.filter((marco) => minutosLimpo >= marco.minutos);
    const atual = conquistados.length > 0 ? conquistados[conquistados.length - 1] : null;
    const proximo = MARCOS_DE_SAUDE[conquistados.length] || null;
    const base = atual ? atual.minutos : 0;
    const faltamMinutos = proximo === null ? 0 : proximo.minutos - minutosLimpo;
    const progresso =
        proximo === null ? 1 : Math.min(1, (minutosLimpo - base) / (proximo.minutos - base));

    return {
        pronto: true,
        // Início no futuro = o último dia com uso é hoje: o relógio só começa a
        // andar na virada do dia.
        usouHoje: inicio > agora,
        minutosLimpo,
        conquistados,
        atual,
        proximo,
        progresso,
        faltamMinutos,
    };
}
