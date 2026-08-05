//
// Histórico de aparelhos com vigência. Existe porque a economia de um dia é
// puxadas não dadas × custo por puxada: usar o aparelho ATUAL pra precificar o
// passado faz cadastrar um vape mais caro reescrever meses de economia já
// registrada (e disparar conquista de economia de mentira).
//
// Shape persistido (campo `deviceHistory`), em ordem cronológica:
//   [{ name, price, totalPuffs, days, desde: 'YYYY-MM-DD' }, ...]
//
// `desde` é o único campo novo em relação ao aparelho de sempre. Entrada SEM
// `desde` válido vale "desde sempre" — é o que deixa migrar quem já tinha
// aparelho salvo antes desse histórico existir, sem inventar uma data.
//
// Módulo folha: não importa nada de utils/ (nem datas.js — quem sabe que dia é
// hoje é quem chama).

const FORMATO_DE_DATA = /^\d{4}-\d{2}-\d{2}$/;

function numeroPositivo(valor) {
    const n = Number(valor);
    return !isNaN(n) && n > 0 ? n : null;
}

function dataDeVigencia(entrada) {
    const desde = entrada?.desde;
    return typeof desde === 'string' && FORMATO_DE_DATA.test(desde) ? desde : null;
}

// Um aparelho só entra no histórico se dá pra calcular alguma coisa com ele.
function aparelhoUtilizavel(entrada) {
    if (!entrada || typeof entrada !== 'object') return false;
    return (
        numeroPositivo(entrada.price) !== null &&
        numeroPositivo(entrada.totalPuffs) !== null &&
        numeroPositivo(entrada.days) !== null
    );
}

// Descarta o que não é aparelho e ordena por vigência (sem `desde` primeiro:
// "vale desde sempre" vem antes de qualquer data). Empate mantém a ordem
// original — Array.prototype.sort é estável.
export function normalizarHistorico(valor) {
    if (!Array.isArray(valor)) return [];
    return valor.filter(aparelhoUtilizavel).sort((a, b) => {
        const desdeA = dataDeVigencia(a);
        const desdeB = dataDeVigencia(b);
        if (desdeA === desdeB) return 0;
        if (desdeA === null) return -1;
        if (desdeB === null) return 1;
        return desdeA < desdeB ? -1 : 1;
    });
}

// O aparelho que valia em `data`: a última entrada que já tinha começado.
// Comparação lexicográfica de 'YYYY-MM-DD' (mesmo padrão de utils/economia.js).
//
// Dia anterior à primeira vigência cai na primeira entrada em vez de null:
// registro antigo de quem só cadastrou o vape depois continua sendo
// precificado, exatamente como era antes do histórico existir.
export function aparelhoEm(historico, data) {
    const lista = normalizarHistorico(historico);
    if (lista.length === 0) return null;

    let vigente = null;
    for (const entrada of lista) {
        const desde = dataDeVigencia(entrada);
        if (desde === null || desde <= data) vigente = entrada;
    }
    return vigente ?? lista[0];
}

// Quebra o histórico em períodos de vigência: cada aparelho com o intervalo em
// que ele valeu. `de` é inclusivo (null = "desde sempre", entrada sem `desde`)
// e `ate` é EXCLUSIVO — é o `desde` do próximo aparelho, ou null no atual, que
// não terminou. Intervalo meio-aberto porque é assim que aparelhoEm decide:
// o dia em que o aparelho novo entra já é dele.
export function periodosDeAparelho(historico) {
    const lista = normalizarHistorico(historico);
    return lista.map((aparelho, indice) => ({
        aparelho,
        de: dataDeVigencia(aparelho),
        ate: indice + 1 < lista.length ? dataDeVigencia(lista[indice + 1]) : null,
    }));
}

function mesmoAparelho(a, b) {
    return (
        a?.name === b?.name &&
        Number(a?.price) === Number(b?.price) &&
        Number(a?.totalPuffs) === Number(b?.totalPuffs) &&
        Number(a?.days) === Number(b?.days)
    );
}

// Histórico depois de salvar `aparelho` em `hoje`. Três casos:
//   - nada mudou em relação ao aparelho atual: histórico intacto (salvar duas
//     vezes o mesmo formulário não cria vigência nova);
//   - a última vigência já é de hoje: substitui (corrigir o preço que acabou de
//     ser digitado é edição, não troca de aparelho);
//   - senão: mais uma vigência começando hoje.
export function historicoComNovoAparelho(historico, aparelho, hoje) {
    const lista = normalizarHistorico(historico);
    if (!aparelhoUtilizavel(aparelho)) return lista;

    const ultima = lista[lista.length - 1] ?? null;
    if (ultima && mesmoAparelho(ultima, aparelho)) return lista;

    const nova = { ...aparelho, desde: hoje };
    if (ultima && dataDeVigencia(ultima) === hoje) {
        return [...lista.slice(0, -1), nova];
    }
    return [...lista, nova];
}

// ─── Lista de dispositivos ───────────────────────────────────────────────────
//
// O histórico acima resolve "qual vape valia naquele dia". A lista de
// dispositivos resolve outra coisa: QUAIS vapes o usuário tem, pra ele escolher
// no registro qual usou. Um registro guarda `deviceId` e é precificado por esse
// dispositivo — não mais pela data.
//
// Shape persistido (campo `devices`):
//   [{ id, name, price, totalPuffs, days, createdAt, archived, isDefault }, ...]
//
// `archived: true` some do seletor mas continua precificando os registros que
// já apontam pra ele: apagar de vez um dispositivo com registro reescreveria a
// economia do passado, que é justamente o que este arquivo existe pra evitar.
//
// `isDefault` é o dispositivo que já vem selecionado no registro. Fica na
// própria lista (e não numa chave separada) porque é uma propriedade dela: só
// um pode ser padrão, e quem escreve a lista escreve o padrão junto, sem
// espelho novo e sem os dois saírem de sincronia.

function idValido(valor) {
    const n = Number(valor);
    return !isNaN(n) && valor !== null && valor !== undefined && valor !== '' ? n : null;
}

// Descarta o que não dá pra calcular (mesma regra do histórico) e o que não tem
// id — sem id não dá pra ligar registro a dispositivo.
export function normalizarDispositivos(valor) {
    if (!Array.isArray(valor)) return [];
    return valor
        .filter((entrada) => aparelhoUtilizavel(entrada) && idValido(entrada?.id) !== null)
        .map((entrada) => ({
            ...entrada,
            id: idValido(entrada.id),
            archived: entrada.archived === true,
            isDefault: entrada.isDefault === true,
        }));
}

export function dispositivoPorId(dispositivos, id) {
    const alvo = idValido(id);
    if (alvo === null) return null;
    return normalizarDispositivos(dispositivos).find((d) => d.id === alvo) ?? null;
}

// Os que aparecem no seletor do registro.
export function dispositivosAtivos(dispositivos) {
    return normalizarDispositivos(dispositivos).filter((d) => !d.archived);
}

// O dispositivo que já vem selecionado no registro. Padrão arquivado não vale
// (ele saiu de circulação), e sem padrão marcado cai no último ativo — que é o
// que a lista fazia antes de existir a marcação explícita.
export function dispositivoPadrao(dispositivos) {
    const ativos = dispositivosAtivos(dispositivos);
    return ativos.find((d) => d.isDefault) ?? ativos[ativos.length - 1] ?? null;
}

// Marca `id` como padrão e tira a marca de todos os outros — o padrão é único
// por construção, então quem escreve a lista passa por aqui.
export function comDispositivoPadrao(dispositivos, id) {
    const alvo = idValido(id);
    return normalizarDispositivos(dispositivos).map((dispositivo) => ({
        ...dispositivo,
        isDefault: dispositivo.id === alvo && !dispositivo.archived,
    }));
}

// O dispositivo que precifica um registro. Três camadas, nessa ordem:
//   1. o `deviceId` do próprio registro (o caminho novo);
//   2. o aparelho que valia na data (registro salvo antes desta feature);
//   3. o aparelho atual (quem nunca teve histórico).
// A camada 2 é o que faz a economia já registrada continuar idêntica.
export function dispositivoDoRegistro(registro, dispositivos, historico, aparelhoAtual) {
    const doId = dispositivoPorId(dispositivos, registro?.deviceId);
    if (doId) return doId;
    return aparelhoEm(historico, registro?.date) ?? aparelhoAtual ?? null;
}

// Quantas puxadas cada dispositivo já levou, somando os registros que apontam
// pra ele. Registro sem uso não conta (`used: false` é sempre zero puxada) —
// mesma regra de puxadasDoRegistro, repetida aqui porque este é módulo folha.
export function consumoPorDispositivo(registros) {
    const total = {};
    (Array.isArray(registros) ? registros : []).forEach((registro) => {
        const id = idValido(registro?.deviceId);
        if (id === null || !registro?.used) return;
        const puxadas = Number(registro.puffs);
        total[id] = (total[id] ?? 0) + (isNaN(puxadas) ? 0 : puxadas);
    });
    return total;
}

// Quanto do dispositivo já foi. `esgotado` é o gatilho do aviso de "acabou?":
// passou do que ele rende, então ou acabou mesmo ou o total declarado está
// errado — quem decide é o usuário.
export function estadoDoDispositivo(dispositivo, consumidas) {
    const total = numeroPositivo(dispositivo?.totalPuffs);
    const usadas = Math.max(0, Number(consumidas) || 0);
    if (total === null) {
        return { usadas, total: null, restante: null, percentual: 0, esgotado: false };
    }
    return {
        usadas,
        total,
        restante: Math.max(0, total - usadas),
        percentual: Math.min(100, Math.round((usadas / total) * 100)),
        esgotado: usadas >= total,
    };
}

// Migração implícita pra quem já tinha aparelho cadastrado antes da lista
// existir: cada vigência do histórico vira um dispositivo, o último ativo e os
// anteriores arquivados (já foram trocados). O id sai da vigência pra ser
// estável entre chamadas — se fosse Date.now() a lista mudaria de id a cada
// leitura, e os registros nunca casariam com ela.
export function dispositivosDerivadosDoHistorico(historico) {
    const lista = normalizarHistorico(historico);
    return lista.map((aparelho, indice) => {
        const desde = dataDeVigencia(aparelho);
        return {
            ...aparelho,
            id: desde === null ? indice + 1 : Number(desde.replace(/-/g, '')) * 10 + indice,
            createdAt: desde,
            archived: indice < lista.length - 1,
            isDefault: indice === lista.length - 1,
        };
    });
}
