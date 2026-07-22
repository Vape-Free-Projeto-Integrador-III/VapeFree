// src/utils/records.js
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
export function recordPuffs(record) {
  return record?.used ? record.puffs || 0 : 0;
}

// Soma de puxadas de uma lista de registros.
export function sumPuffs(records) {
  return records.reduce((total, record) => total + recordPuffs(record), 0);
}

// Normaliza antes de persistir: sem uso = sem puxadas e sem gatilhos.
export function normalizeRecord(record) {
  if (record.used) return record;
  return { ...record, puffs: 0, triggers: [] };
}
