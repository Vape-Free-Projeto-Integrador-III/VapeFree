//
// Helpers puros de leitura de um registro (Record). Existem pra garantir que
// todo lugar que soma puxadas trate um registro com `used: false` do mesmo
// jeito: zero puxadas.
//
// Motivo: um registro pode ter sido salvo como "usei, 3 puxadas" e depois
// editado pra "não usei". Se o `puffs` antigo continuar no dado (registros
// salvos antes da normalização), gráfico e totais mostrariam 3 puxadas num
// dia sem uso.

// Puxadas efetivas do registro — 0 quando não houve uso.
export function puxadasDoRegistro(registro) {
    return registro?.used ? registro.puffs || 0 : 0;
}

// Soma de puxadas de uma lista de registros.
export function somarPuxadas(registros) {
    return registros.reduce((total, registro) => total + puxadasDoRegistro(registro), 0);
}

// Normaliza antes de persistir: sem uso = sem puxadas e sem gatilhos.
export function normalizarRegistro(registro) {
    if (registro.used) return registro;
    return { ...registro, puffs: 0, triggers: [] };
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
