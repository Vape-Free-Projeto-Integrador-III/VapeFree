//
// Fonte ÚNICA de conversão entre Date e a string 'YYYY-MM-DD' que o app usa
// como campo `date` do registro, chave de período de missão, chave do mapa de
// economia e célula do heatmap.
//
// A regra: toda data de calendário sai daqui, e SEMPRE em horário local.
// `toISOString()` devolve UTC — no Brasil (UTC-3) isso fazia o app virar o dia
// às 21h: registro noturno caía no dia seguinte, streak quebrava, missão
// diária não contava e o heatmap ficava deslocado. `toISOString()` continua
// certo para TIMESTAMP DE INSTANTE (unlockedAt, updatedAt, completedAt), que
// é outra coisa — instante é global, dia de calendário é local.
//
// Este arquivo é um módulo FOLHA: não importa nada de utils/. storage.js,
// meta.js, missions.js, achievements.js e xp.js dependem dele, então qualquer
// import de volta faria ciclo.
//

// mes é 0-11, igual Date.getMonth().
export function chaveDeData(ano, mes, dia) {
    return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

// Date -> 'YYYY-MM-DD' pelos getters LOCAIS. É o primitivo que todo o resto
// deste arquivo usa; nunca troque por toISOString().slice(0, 10).
export function chaveDeDataLocal(data) {
    return chaveDeData(data.getFullYear(), data.getMonth(), data.getDate());
}

// 'YYYY-MM-DD' -> Date. Meio-dia evita o off-by-one de fuso que o parse UTC
// puro (new Date('2026-07-31')) causaria.
export function converterDataLocal(dataStr) {
    return new Date(`${dataStr}T12:00:00`);
}

export function dataDeHoje() {
    return chaveDeDataLocal(new Date());
}

export function ultimosNDias(n) {
    const dias = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dias.push(chaveDeDataLocal(d));
    }
    return dias;
}

export function ultimasNSemanas(n) {
    const semanas = [];
    const hoje = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(hoje);
        d.setDate(d.getDate() - i * 7);
        semanas.push(chaveDeDataLocal(d));
    }
    return semanas;
}

export function ultimosNMeses(n) {
    const meses = [];
    const hoje = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
        meses.push(chaveDeDataLocal(d));
    }
    return meses;
}

// Data 'YYYY-MM-DD' deslocada em N dias (N pode ser negativo).
export function deslocarData(dataStr, dias) {
    const data = converterDataLocal(dataStr);
    data.setDate(data.getDate() + dias);
    return chaveDeDataLocal(data);
}

// Diferença em dias entre duas datas 'YYYY-MM-DD' (b - a).
export function diferencaEmDias(a, b) {
    const inicio = converterDataLocal(a);
    const fim = converterDataLocal(b);
    return Math.round((fim - inicio) / 86400000);
}

// Segunda-feira da semana de uma data 'YYYY-MM-DD'. Domingo pertence à semana
// que começou na segunda anterior (por isso o -6).
export function inicioDaSemana(dataStr) {
    const data = converterDataLocal(dataStr);
    const diaDaSemana = data.getDay();
    data.setDate(data.getDate() - diaDaSemana + (diaDaSemana === 0 ? -6 : 1));
    return chaveDeDataLocal(data);
}

// As 7 datas da semana de `dataStr`, de segunda a domingo.
export function diasDaSemana(dataStr) {
    const inicio = converterDataLocal(inicioDaSemana(dataStr));
    const dias = [];
    for (let i = 0; i < 7; i++) {
        const dia = new Date(inicio);
        dia.setDate(inicio.getDate() + i);
        dias.push(chaveDeDataLocal(dia));
    }
    return dias;
}
