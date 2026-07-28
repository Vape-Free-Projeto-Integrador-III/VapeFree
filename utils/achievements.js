
import { metaValida, metaDoDia, mediaDiariaNasDatas, janelaDeDias, deslocarData } from './meta';
import { somarPuxadas } from './records';

// Mínimo de dias registrados numa janela de 7 pra ela poder ser comparada com
// outra. A média ignora dia sem registro, então sem esse piso um único dia
// isolado já viraria "semana inteira".
const MIN_DIAS_PARA_COMPARAR = 3;

export const CONQUISTAS = [
  {
    id: 'first_record',
    xp: 20,
    titulo: 'Primeiro Passo',
    descricao: 'Você fez seu primeiro registro',
    icone: '📝',
    condicao: (registros) => registros.length >= 1,
  },
  {
    id: 'streak_3',
    xp: 40,
    titulo: 'Começando Bem',
    descricao: '3 dias seguidos sem usar',
    icone: '🔥',
    condicao: (registros) => calcularStreak(registros) >= 3,
  },
  {
    id: 'streak_7',
    xp: 80,
    titulo: 'Uma Semana',
    descricao: '7 dias seguidos sem usar',
    icone: '🌟',
    condicao: (registros) => calcularStreak(registros) >= 7,
  },
  {
    id: 'streak_14',
    xp: 120,
    titulo: 'Duas Semanas',
    descricao: '14 dias seguidos sem usar',
    icone: '💪',
    condicao: (registros) => calcularStreak(registros) >= 14,
  },
  {
    id: 'streak_30',
    xp: 250,
    titulo: 'Um Mês',
    descricao: '30 dias seguidos sem usar',
    icone: '🏆',
    condicao: (registros) => calcularStreak(registros) >= 30,
  },
  {
    id: 'no_puffs_1',
    xp: 20,
    titulo: 'Dia Livre',
    descricao: 'Passou 1 dia sem usar o vape',
    icone: '✅',
    // Qualquer dia limpo do histórico serve — não só o de hoje. Amarrar em
    // "hoje" fazia a conquista sumir no dia seguinte e nunca desbloquear pra
    // quem registra com atraso.
    condicao: (registros) => listarDiasLimpos(registros).length >= 1,
  },
  {
    id: 'no_puffs_3',
    xp: 50,
    titulo: 'Três Dias Limpos',
    descricao: 'Passou 3 dias sem usar o vape',
    icone: '🎯',
    // Melhor sequência de dias limpos do histórico inteiro, não só a que termina
    // no dia mais recente — igual `no_puffs_1`, um dia com uso hoje não apaga
    // uma sequência limpa que já aconteceu.
    condicao: (registros) => calcularStreakDeDias(listarDiasLimpos(registros)) >= 3,
  },
  {
    id: 'total_no_7',
    xp: 80,
    titulo: 'Resistência',
    descricao: '7 dias sem usar, não precisa ser seguido',
    icone: '🛡️',
    condicao: (registros) => {
      const diasSemUso = new Set(
        registros
          .filter((r) => !r.used)
          .map((r) => r.date)
      ).size;
      return diasSemUso >= 7;
    },
  },
  {
    id: 'economy_50',
    xp: 50,
    titulo: 'Primeiras Economias',
    descricao: 'Você já guardou R$ 50 não usando o vape',
    icone: '💰',
    condicao: (registros, economia) => {
      const total = Object.values(economia || {}).reduce((a, v) => a + v, 0);
      return total >= 50;
    },
  },
  {
    id: 'economy_200',
    xp: 150,
    titulo: 'Economia de Verdade',
    descricao: 'Você já guardou R$ 200 não usando o vape',
    icone: '💵',
    condicao: (registros, economia) => {
      const total = Object.values(economia || {}).reduce((a, v) => a + v, 0);
      return total >= 200;
    },
  },
  {
    id: 'records_10',
    xp: 40,
    titulo: 'Constância',
    descricao: 'Você já fez 10 registros',
    icone: '📊',
    condicao: (registros) => registros.length >= 10,
  },
  {
    id: 'first_mission',
    xp: 20,
    titulo: 'Missão Cumprida',
    descricao: 'Você concluiu sua primeira missão',
    icone: '🎯',
    condicao: (registros, economia, missoesConcluidas) =>
      (missoesConcluidas || []).length >= 1,
  },
  {
    id: 'records_30',
    xp: 100,
    titulo: 'Dedicação',
    descricao: 'Você já fez 30 registros',
    icone: '⭐',
    condicao: (registros) => registros.length >= 30,
  },
  {
    id: 'economy_500',
    xp: 300,
    titulo: 'Meio Milhar',
    descricao: 'Você já guardou R$ 500 não usando o vape',
    icone: '💎',
    condicao: (registros, economia) => {
      const total = Object.values(economia || {}).reduce((a, v) => a + v, 0);
      return total >= 500;
    },
  },
  {
    id: 'economy_1000',
    xp: 500,
    titulo: 'Mil Reais Livres',
    descricao: 'Você já guardou R$ 1000 não usando o vape',
    icone: '👑',
    condicao: (registros, economia) => {
      const total = Object.values(economia || {}).reduce((a, v) => a + v, 0);
      return total >= 1000;
    },
  },
  {
    id: 'breathing_5',
    xp: 60,
    titulo: 'Respira Fundo',
    descricao: 'Você usou a técnica de respiração 5 vezes no modo crise',
    icone: '🫁',
    condicao: (registros, economia, missoesConcluidas, contexto) =>
      (contexto?.sessoesDeCrise || []).filter(
        (s) => s.method === 'respiracao' && s.completed === true
      ).length >= 5,
  },
  {
    id: 'crisis_passed_3',
    xp: 80,
    titulo: 'Mais Forte que a Vontade',
    descricao: 'Você venceu a vontade 3 vezes no modo crise',
    icone: '🧗',
    condicao: (registros, economia, missoesConcluidas, contexto) =>
      (contexto?.sessoesDeCrise || []).filter((s) => s.outcome === 'passou').length >= 3,
  },
  {
    id: 'trigger_aware_3',
    xp: 50,
    titulo: 'Autoconhecimento',
    descricao: 'Você identificou o mesmo gatilho 3 vezes',
    icone: '🔍',
    condicao: (registros) => {
      const contagens = new Map();
      for (const registro of registros || []) {
        for (const gatilho of registro.triggers || []) {
          const chave = String(gatilho).trim().toLowerCase();
          if (!chave) continue;
          contagens.set(chave, (contagens.get(chave) || 0) + 1);
        }
      }
      return [...contagens.values()].some((contagem) => contagem >= 3);
    },
  },
  {
    id: 'app_open_7',
    xp: 70,
    titulo: 'Presença Diária',
    descricao: 'Você abriu o app 7 dias seguidos',
    icone: '📆',
    condicao: (registros, economia, missoesConcluidas, contexto) =>
      calcularStreakDeDias(contexto?.diasDeAbertura) >= 7,
  },
  {
    id: 'shield_earned',
    xp: 40,
    titulo: 'Escudo na Mão',
    // 7 = DIAS_PARA_ESCUDO, escrito à mão: a constante só é declarada mais
    // abaixo no arquivo e este array é avaliado na carga do módulo.
    descricao: '7 dias limpos te deram um escudo',
    icone: '🛡️',
    // Ter gastado um escudo também conta: senão quem ganhou e usou antes de o
    // app sincronizar nunca desbloquearia esta.
    condicao: (registros) => {
      const estado = calcularEstadoDeStreak(registros);
      return estado.escudos >= 1 || estado.diasProtegidos.length >= 1;
    },
  },
  {
    id: 'shield_used',
    xp: 60,
    titulo: 'O Escudo Segurou',
    descricao: 'Um dia com uso não derrubou seu streak',
    icone: '⚔️',
    // diasProtegidos é histórico, diferente de gastouEscudoNoUltimoDia (que é
    // transitório): a conquista não some se o usuário demorar a abrir o app.
    condicao: (registros) => calcularEstadoDeStreak(registros).diasProtegidos.length >= 1,
  },
  {
    id: 'halved_weekly',
    xp: 100,
    titulo: 'Cortou pela Metade',
    descricao: 'Sua média diária caiu pela metade em relação à semana anterior',
    icone: '📉',
    condicao: (registros, economia, missoesConcluidas, contexto) => {
      const hoje = contexto?.hoje || new Date().toISOString().slice(0, 10);
      const datasAgora = janelaDeDias(hoje, 7);
      const datasAnteriores = janelaDeDias(deslocarData(hoje, -7), 7);
      const mediaAgora = mediaDiariaNasDatas(registros, datasAgora);
      const mediaAntes = mediaDiariaNasDatas(registros, datasAnteriores);
      if (mediaAgora === null || mediaAntes === null || mediaAntes <= 0) return false;
      // As DUAS semanas precisam estar minimamente registradas: a média ignora
      // dia sem registro, então 1 dia isolado (de um lado ou do outro) viraria
      // "queda pela metade".
      const diasRegistrados = (datas) =>
        new Set(
          (registros || [])
            .filter((registro) => datas.includes(registro.date))
            .map((registro) => registro.date)
        ).size;
      if (diasRegistrados(datasAnteriores) < MIN_DIAS_PARA_COMPARAR) return false;
      if (diasRegistrados(datasAgora) < MIN_DIAS_PARA_COMPARAR) return false;
      return mediaAgora <= mediaAntes / 2;
    },
  },
  {
    id: 'goal_reached',
    xp: 150,
    titulo: 'Meta Batida',
    descricao: '7 dias seguidos registrados, todos dentro do seu limite do dia',
    icone: '🎯',
    // Os 7 dias precisam estar TODOS registrados e cada um deles abaixo da
    // meta DAQUELE dia (a rampa desce, então o limite de 6 dias atrás era
    // maior). Antes só a média valia — e como a média ignora dia sem registro,
    // um único dia registrado abaixo do alvo já desbloqueava a conquista.
    condicao: (registros, economia, missoesConcluidas, contexto) => {
      const meta = contexto?.meta;
      if (!metaValida(meta)) return false;
      const hoje = contexto?.hoje || new Date().toISOString().slice(0, 10);
      const datas = janelaDeDias(hoje, 7);
      return datas.every((data) => {
        const doDia = (registros || []).filter((registro) => registro.date === data);
        if (doDia.length === 0) return false;
        const limite = metaDoDia(meta, data);
        return limite !== null && somarPuxadas(doDia) <= limite;
      });
    },
  },
];

// Maior sequência de dias consecutivos numa lista de datas 'YYYY-MM-DD'.
// Usada pelas conquistas que contam dias corridos fora dos registros
// (ex: abrir o app), então não olha o campo `used` de nada.
export function calcularStreakDeDias(datas) {
  const unicas = [...new Set((datas || []).filter(Boolean))].sort();
  if (unicas.length === 0) {
    return 0;
  }

  let melhor = 1;
  let atual = 1;

  for (let i = 1; i < unicas.length; i++) {
    const anterior = new Date(`${unicas[i - 1]}T12:00:00`);
    anterior.setDate(anterior.getDate() + 1);
    if (anterior.toISOString().slice(0, 10) === unicas[i]) {
      atual += 1;
      melhor = Math.max(melhor, atual);
    } else {
      atual = 1;
    }
  }

  return melhor;
}

// Datas 'YYYY-MM-DD' ordenadas dos dias limpos: dia com pelo menos um registro
// e nenhum com `used === true` — mesma definição usada pelo streak/escudo.
export function listarDiasLimpos(registros) {
  const registrosPorData = agruparRegistrosPorData(
    Array.isArray(registros) ? registros : []
  );
  return Object.entries(registrosPorData)
    .filter(([, registrosDoDia]) =>
      registrosDoDia.length > 0 && !registrosDoDia.some((registro) => registro.used === true)
    )
    .map(([data]) => data)
    .sort();
}

function agruparRegistrosPorData(registros) {
  return registros.reduce((grupos, registro) => {
    if (!grupos[registro.date]) {
      grupos[registro.date] = [];
    }
    grupos[registro.date].push(registro);
    return grupos;
  }, {});
}

// ─── Streak + escudo ─────────────────────────────────────────────────────────
// O escudo NÃO é dado persistido: é derivado do histórico de registros, junto
// com o streak, por `calcularEstadoDeStreak`. Foi assim que a mecânica voltou
// depois de a versão antiga (estado incremental salvo no Firestore) ficar
// permanentemente dessincronizada — aqui, editar ou apagar um registro antigo
// recalcula tudo sozinho.
//
// Regras:
// - Dia limpo = dia com pelo menos um registro e nenhum com `used === true`.
// - A cada DIAS_PARA_ESCUDO dias limpos ganha 1 escudo (máximo MAX_ESCUDOS).
// - Dia com uso registrado, tendo escudo e streak: gasta o escudo, o streak
//   ainda soma 1 e o contador pro próximo escudo volta a zero (esse dia não
//   conta pros próximos 7).
// - Dia sem registro nenhum zera o streak — escudo não cobre esquecimento.
// - Quando o streak zera, o escudo guardado se perde junto.

export const DIAS_PARA_ESCUDO = 7;
const MAX_ESCUDOS = 1;

// Simula o histórico pra frente, do primeiro ao último dia com registro. Dias
// depois do último registro não são avaliados: senão o streak quebraria
// sozinho antes de o usuário registrar o dia de hoje.
export function calcularEstadoDeStreak(registros) {
  const vazio = {
    streak: 0,
    escudos: 0,
    progresso: 0,
    diasProtegidos: [],
    ultimoDiaProtegido: null,
    gastouEscudoNoUltimoDia: false,
  };

  if (!Array.isArray(registros) || registros.length === 0) {
    return vazio;
  }

  const registrosPorData = agruparRegistrosPorData(registros);
  const datas = Object.keys(registrosPorData).sort();
  const dataDoUltimoRegistro = datas[datas.length - 1];
  const cursor = new Date(`${datas[0]}T12:00:00`);

  let streak = 0;
  let escudos = 0;
  let progresso = 0;
  const diasProtegidos = [];

  while (true) {
    const chaveDaData = cursor.toISOString().slice(0, 10);
    const registrosDoDia = registrosPorData[chaveDaData] || [];
    const temRegistro = registrosDoDia.length > 0;
    const limpo = temRegistro && !registrosDoDia.some((registro) => registro.used === true);

    if (limpo) {
      streak += 1;
      progresso += 1;
      if (progresso >= DIAS_PARA_ESCUDO) {
        if (escudos < MAX_ESCUDOS) {
          escudos = MAX_ESCUDOS;
          progresso = 0;
        } else {
          // Já está com o escudo cheio: congela em vez de transbordar, senão
          // gastar o escudo devolveria outro na hora.
          progresso = DIAS_PARA_ESCUDO;
        }
      }
    } else if (temRegistro && escudos > 0 && streak > 0) {
      escudos = 0;
      progresso = 0;
      streak += 1;
      diasProtegidos.push(chaveDaData);
    } else {
      // Sequência quebrou de vez: o escudo pertence à sequência, morre com ela.
      streak = 0;
      escudos = 0;
      progresso = 0;
    }

    if (chaveDaData >= dataDoUltimoRegistro) {
      break;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  const ultimoDiaProtegido = diasProtegidos.length
    ? diasProtegidos[diasProtegidos.length - 1]
    : null;

  return {
    streak,
    escudos,
    progresso,
    diasProtegidos,
    ultimoDiaProtegido,
    // Só o dia mais recente do histórico é "acabou de acontecer" — é o que a
    // Home usa pra avisar que o escudo foi gasto agora, e não semanas atrás.
    gastouEscudoNoUltimoDia: ultimoDiaProtegido === dataDoUltimoRegistro,
  };
}

export function calcularStreak(registros) {
  return calcularEstadoDeStreak(registros).streak;
}

// `contexto` traz o que não está nos registros:
// { sessoesDeCrise, diasDeAbertura }.
export async function verificarConquistas(
  registros,
  economia = {},
  conquistasDesbloqueadas = [],
  missoesConcluidas = [],
  contexto = {}
) {
  const mapaDesbloqueadas = new Map(
    (conquistasDesbloqueadas || []).map((conquista) => [conquista.id, conquista])
  );
  const resultados = [];
  const agora = new Date().toISOString();

  for (const conquista of CONQUISTAS) {
    const conquistaSalva = mapaDesbloqueadas.get(conquista.id);
    const desbloqueada = conquistaSalva
      ? true
      : conquista.condicao(registros, economia, missoesConcluidas, contexto);
    resultados.push({
      id: conquista.id,
      titulo: conquista.titulo,
      descricao: conquista.descricao,
      icone: conquista.icone,
      xp: conquista.xp || 0,
      desbloqueada,
      desbloqueadaEm: conquistaSalva?.unlockedAt || (desbloqueada ? agora : null),
    });
  }

  return resultados;
}
