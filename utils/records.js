import {
    periodosDeAparelho,
    normalizarDispositivos,
    consumoPorDispositivo,
    estadoDoDispositivo,
} from './aparelhos';
import { economiaNoIntervalo } from './economia';

//
// Helpers puros de leitura de um registro (Record). Existem pra garantir que
// todo lugar que soma puxadas trate um registro com `used: false` do mesmo
// jeito: zero puxadas.
//
// Motivo: um registro pode ter sido salvo como "usei, 3 puxadas" e depois
// editado pra "não usei". Se o `puffs` antigo continuar no dado (registros
// salvos antes da normalização), gráfico e totais mostrariam 3 puxadas num
// dia sem uso.

// Teto de puxadas de um dia. Sem ele, um dedo escorregado no teclado (999999)
// estoura a escala do gráfico do histórico e infla a economia calculada, que é
// puxadas × custoPorPuxada. 2000 já é muito acima de qualquer uso real de um
// dia — vaper pesado fica na casa das centenas.
export const MAX_PUXADAS_DIA = 2000;

// Prende um valor de puxadas na faixa [0, teto]. Aceita string do TextInput;
// devolve 0 pro que não é número. `teto` é opcional e nunca passa de
// MAX_PUXADAS_DIA — quem chama sem ele (a normalização de escrita) continua
// com o teto global de antes.
export function limitarPuxadas(valor, teto) {
    const n = Math.floor(Number(valor));
    if (!Number.isFinite(n) || n < 0) return 0;
    const limite = Number.isFinite(Number(teto))
        ? Math.min(MAX_PUXADAS_DIA, Math.max(0, Math.floor(Number(teto))))
        : MAX_PUXADAS_DIA;
    return Math.min(n, limite);
}

// Teto de puxadas de um dia com um dispositivo específico: nenhum dia pode
// passar do que o vape inteiro rende — um pod de 600 puxadas aceitar 2000 num
// dia só é dado impossível, e a economia sairia dele.
export function tetoDePuxadasDoDispositivo(dispositivo) {
    const total = numeroPositivo(dispositivo?.totalPuffs);
    if (total === null) return MAX_PUXADAS_DIA;
    return Math.min(MAX_PUXADAS_DIA, Math.floor(total));
}

// Teto da anotação livre do dia (campo `note`). Existe pelo mesmo motivo do
// teto de puxadas: o texto vai inteiro pro documento do Firestore e pro
// espelho local, então não pode virar um despejo de texto sem limite. 280
// caracteres dão pra contar o dia sem virar diário.
export const MAX_NOTA = 280;

// Normaliza a anotação livre: string aparada e cortada no teto, ou null quando
// não tem nada escrito. null (e não undefined) porque é o que o Firestore
// aceita gravar — mesmo padrão da nota da sessão de crise.
export function normalizarNota(valor) {
    if (typeof valor !== 'string') return null;
    const limpa = valor.trim().slice(0, MAX_NOTA);
    return limpa === '' ? null : limpa;
}

// Busca na anotação livre. Comparação sem acento e sem caixa pra "cafe" achar
// "Café" e "ANSIEDADE" achar "ansiedade" — quem escreveu a nota no celular
// raramente repete a acentuação na hora de procurar.
//
// Sem `String.prototype.normalize('NFD')`: o suporte a ele no Hermes não é
// garantido em toda versão, e o alfabeto que interessa aqui é o do português.
const COM_ACENTO = 'áàâãäéèêëíìîïóòôõöúùûüçñ';
const SEM_ACENTO = 'aaaaaeeeeiiiiooooouuuucn';

export function normalizarBusca(texto) {
    if (typeof texto !== 'string') return '';
    return texto
        .trim()
        .toLowerCase()
        .replace(/[^\x00-\x7F]/g, (caractere) => {
            const i = COM_ACENTO.indexOf(caractere);
            return i === -1 ? caractere : SEM_ACENTO[i];
        });
}

// A nota casa com o termo buscado? Termo vazio casa com tudo — é o estado
// normal do campo de busca, que não deve esconder registro nenhum.
export function notaCasaComBusca(nota, termo) {
    const busca = normalizarBusca(termo);
    if (busca === '') return true;
    return normalizarBusca(nota).includes(busca);
}

// Puxadas efetivas do registro — 0 quando não houve uso.
export function puxadasDoRegistro(registro) {
    return registro?.used ? registro.puffs || 0 : 0;
}

// Soma de puxadas de uma lista de registros.
export function somarPuxadas(registros) {
    return registros.reduce((total, registro) => total + puxadasDoRegistro(registro), 0);
}

// Normaliza antes de persistir: sem uso = sem puxadas e sem gatilhos; com uso,
// puxadas presas no teto (última linha de defesa — a tela já limita o input).
// A anotação livre vale nos dois casos — o dia sem uso também rende texto.
// O dispositivo do dia só existe quando houve uso — dia sem vape não tem
// aparelho a que atribuir, e um `deviceId` sobrando ali inflaria o consumo
// daquele dispositivo. `null` (e não undefined) porque é o que o Firestore
// aceita gravar, mesmo padrão da nota.
export function normalizarRegistro(registro) {
    const note = normalizarNota(registro.note);
    if (registro.used) {
        const bruto = registro.deviceId;
        const deviceId =
            bruto === null || bruto === undefined || bruto === '' || isNaN(Number(bruto))
                ? null
                : Number(bruto);
        return { ...registro, puffs: limitarPuxadas(registro.puffs), deviceId, note };
    }
    return { ...registro, puffs: 0, triggers: [], deviceId: null, note };
}

// ─── Aparelho ────────────────────────────────────────────────────────────────
// Contas derivadas do aparelho cadastrado ({ price, totalPuffs, days }). Ficam
// aqui pra economia, prévia do DeviceScreen e alerta de excesso usarem a mesma
// fórmula. Devolvem null quando o aparelho não dá pra calcular.

function numeroPositivo(valor) {
    const n = Number(valor);
    return !isNaN(n) && n > 0 ? n : null;
}

// Meta de puxadas por dia declarada no aparelho.
export function metaDiaria(aparelho) {
    const total = numeroPositivo(aparelho?.totalPuffs);
    const dias = numeroPositivo(aparelho?.days);
    if (total === null || dias === null) return null;
    return total / dias;
}

// Quanto custa uma puxada.
export function custoPorPuxada(aparelho) {
    const preco = numeroPositivo(aparelho?.price);
    const total = numeroPositivo(aparelho?.totalPuffs);
    if (preco === null || total === null) return null;
    return preco / total;
}

// Quanto cada aparelho do histórico custou de verdade: as puxadas dadas
// enquanto ele valia × o custo da puxada DELE. É a leitura que só faz sentido
// depois que a economia virou retroativa por vigência (utils/aparelhos.js) —
// antes disso todo dia era precificado pelo aparelho atual.
//
// Devolve uma lista na mesma ordem cronológica do histórico:
//   { aparelho, de, ate, puxadas, dias, gasto, economizado }
// `de`/`ate` são o período de vigência (`ate` exclusivo, null no atual);
// `dias` é quantos dias distintos têm registro dentro dele.
export function resumoDeAparelhos(historico, registros, economia) {
    const lista = Array.isArray(registros) ? registros : [];
    return periodosDeAparelho(historico).map(({ aparelho, de, ate }) => {
        const doPeriodo = lista.filter(
            (registro) =>
                typeof registro?.date === 'string' &&
                (de === null || registro.date >= de) &&
                (ate === null || registro.date < ate)
        );
        const puxadas = somarPuxadas(doPeriodo);
        const custo = custoPorPuxada(aparelho);
        return {
            aparelho,
            de,
            ate,
            puxadas,
            dias: new Set(doPeriodo.map((registro) => registro.date)).size,
            gasto: custo === null ? 0 : parseFloat((puxadas * custo).toFixed(2)),
            economizado: economiaNoIntervalo(economia, de, ate),
        };
    });
}

// Leitura por DISPOSITIVO (e não por período de vigência): o que cada vape
// cadastrado já levou de puxada, quanto custou e quanto rendeu de economia nos
// dias em que ele foi usado. É o que a lista de dispositivos mostra.
//
// A economia sai da soma dos dias que apontam pro dispositivo — não dá pra usar
// economiaNoIntervalo aqui, porque dois dispositivos podem ser usados em dias
// alternados, sem intervalo contínuo.
//
// Devolve, na ordem da lista:
//   { dispositivo, puxadas, dias, gasto, economizado, estado }
export function resumoDeDispositivos(dispositivos, registros, economia) {
    const lista = Array.isArray(registros) ? registros : [];
    const consumo = consumoPorDispositivo(lista);
    return normalizarDispositivos(dispositivos).map((dispositivo) => {
        const doDispositivo = lista.filter(
            (registro) => Number(registro?.deviceId) === dispositivo.id
        );
        const puxadas = somarPuxadas(doDispositivo);
        const custo = custoPorPuxada(dispositivo);
        const dias = new Set(doDispositivo.map((registro) => registro.date));
        const economizado = [...dias].reduce((soma, dia) => {
            const valor = Number(economia?.[dia]);
            return soma + (isNaN(valor) ? 0 : valor);
        }, 0);
        return {
            dispositivo,
            puxadas,
            dias: dias.size,
            gasto: custo === null ? 0 : parseFloat((puxadas * custo).toFixed(2)),
            economizado: parseFloat(economizado.toFixed(2)),
            estado: estadoDoDispositivo(dispositivo, consumo[dispositivo.id] ?? 0),
        };
    });
}

// Excesso de um dia: quanto passou da meta e quanto isso custou a mais.
// `metaDoDia` vem de metaEfetiva() (utils/meta.js) — a meta declarada pelo
// usuário ganha da meta do aparelho; sem ela, cai em metaDiaria(aparelho).
// Devolve null sem meta nenhuma; senão { puxadasAMais, custoAMais }, com
// puxadasAMais em 0 quando o dia ficou dentro da meta e custoAMais null
// quando existe meta mas não existe aparelho (não dá pra precificar).
export function excessoDoDia(registrosDoDia, aparelho, metaDoDia = null) {
    const meta = metaDoDia !== null && metaDoDia !== undefined ? metaDoDia : metaDiaria(aparelho);
    if (meta === null) return null;
    const usadas = somarPuxadas(registrosDoDia);
    const aMais = Math.max(0, Math.round(usadas - meta));
    const custo = custoPorPuxada(aparelho);
    return {
        puxadasAMais: aMais,
        custoAMais: custo === null ? null : parseFloat((aMais * custo).toFixed(2)),
    };
}
