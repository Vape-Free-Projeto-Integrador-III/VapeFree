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
