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
