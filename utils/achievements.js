// src/utils/achievements.js

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
    condicao: (registros, economia, missoesConcluidas, contexto) => {
      const streak = calcularStreak(registros, contexto?.diasComEscudo);
      return streak >= 3;
    },
  },
  {
    id: 'streak_7',
    xp: 80,
    titulo: 'Uma Semana',
    descricao: '7 dias seguidos sem usar',
    icone: '🌟',
    condicao: (registros, economia, missoesConcluidas, contexto) => {
      const streak = calcularStreak(registros, contexto?.diasComEscudo);
      return streak >= 7;
    },
  },
  {
    id: 'streak_14',
    xp: 120,
    titulo: 'Duas Semanas',
    descricao: '14 dias seguidos sem usar',
    icone: '💪',
    condicao: (registros, economia, missoesConcluidas, contexto) => {
      const streak = calcularStreak(registros, contexto?.diasComEscudo);
      return streak >= 14;
    },
  },
  {
    id: 'streak_30',
    xp: 250,
    titulo: 'Um Mês',
    descricao: '30 dias seguidos sem usar',
    icone: '🏆',
    condicao: (registros, economia, missoesConcluidas, contexto) => {
      const streak = calcularStreak(registros, contexto?.diasComEscudo);
      return streak >= 30;
    },
  },
  {
    id: 'no_puffs_1',
    xp: 20,
    titulo: 'Dia Livre',
    descricao: 'Passou 1 dia sem usar o vape',
    icone: '✅',
    condicao: (registros) => {
      const hoje = new Date().toISOString().slice(0, 10);
      const registrosDeHoje = registros.filter((r) => r.date === hoje);
      return registrosDeHoje.length > 0 && registrosDeHoje.every((r) => !r.used);
    },
  },
  {
    id: 'no_puffs_3',
    xp: 50,
    titulo: 'Três Dias Limpos',
    descricao: 'Passou 3 dias sem usar o vape',
    icone: '🎯',
    condicao: (registros) => {
      const datas = [...new Set(registros.map((r) => r.date))].sort().reverse();
      let diasLimpos = 0;
      for (const data of datas) {
        const registrosDoDia = registros.filter((r) => r.date === data);
        if (registrosDoDia.length > 0 && registrosDoDia.every((r) => !r.used)) {
          diasLimpos++;
        } else {
          break;
        }
      }
      return diasLimpos >= 3;
    },
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
    descricao: 'Você usou a técnica de respiração 5 vezes',
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

function agruparRegistrosPorData(registros) {
  return registros.reduce((grupos, registro) => {
    if (!grupos[registro.date]) {
      grupos[registro.date] = [];
    }
    grupos[registro.date].push(registro);
    return grupos;
  }, {});
}

// Caminha do último registro pra trás enquanto o dia contar como limpo.
// `diasProtegidos` são os dias cobertos por escudo de streak (ver
// utils/storage.js `sincronizarEscudoDeStreak`): contam como limpos mesmo que
// o dia não tenha registro nenhum ou tenha registro com `used === true`.
// Devolve { streak, dataDaQuebra }, onde `dataDaQuebra` é o dia que
// interrompeu a contagem (null quando a sequência chegou no começo do
// histórico).
function percorrerStreak(registros, diasProtegidos = []) {
  if (!Array.isArray(registros) || registros.length === 0) {
    return { streak: 0, dataDaQuebra: null };
  }

  const registrosPorData = agruparRegistrosPorData(registros);
  const protegidos = new Set(diasProtegidos || []);
  const datas = Object.keys(registrosPorData).sort();
  const dataDoPrimeiroRegistro = datas[0];
  const dataDoUltimoRegistro = datas[datas.length - 1];
  const cursor = new Date(`${dataDoUltimoRegistro}T12:00:00`);
  let streak = 0;

  while (true) {
    const chaveDaData = cursor.toISOString().slice(0, 10);

    // Passou do primeiro registro do histórico — não existe dia pra proteger.
    if (chaveDaData < dataDoPrimeiroRegistro) {
      return { streak, dataDaQuebra: null };
    }

    const registrosDoDia = registrosPorData[chaveDaData] || [];
    const limpo = registrosDoDia.length > 0 && !registrosDoDia.some((registro) => registro.used === true);

    if (!limpo && !protegidos.has(chaveDaData)) {
      return { streak, dataDaQuebra: chaveDaData };
    }

    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
}

export function calcularStreak(registros, diasProtegidos = []) {
  return percorrerStreak(registros, diasProtegidos).streak;
}

// Dia que está segurando o streak (sem registro ou com uso), ou null.
// É esse dia que o escudo cobre quando é consumido.
export function encontrarDataDeQuebraDeStreak(registros, diasProtegidos = []) {
  return percorrerStreak(registros, diasProtegidos).dataDaQuebra;
}

// `contexto` traz o que não está nos registros:
// { sessoesDeCrise, diasDeAbertura, diasComEscudo }.
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
