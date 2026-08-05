// Importação do backup JSON gerado por utils/exportacao.js — o caminho de volta
// de "troquei de celular" ou "apaguei o app sem ter conta".
//
// Sobrepõe TUDO o que está salvo hoje (não mistura): quem chama é obrigado a
// confirmar isso com o usuário antes. A escrita em massa é feita por
// substituirTodosOsDados (utils/storage.js), que já cuida do ramo convidado
// (AsyncStorage) e do ramo conta (Firestore + espelho).
//
// Como o arquivo entra no app:
//   - nativo: expo-document-picker devolve um file:// e expo-file-system lê;
//   - web: o próprio picker devolve o File do browser, que já sabe se ler.
//
// O arquivo vem de fora, então NADA aqui confia no formato: normalizarBackup()
// joga fora o que não dá pra usar em vez de deixar dado quebrado subir.

import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';

import { substituirTodosOsDados } from './storage';
import { normalizarRegistro } from './records';
import { normalizarHistorico, normalizarDispositivos } from './aparelhos';

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

function objetoOuNulo(valor) {
    return valor && typeof valor === 'object' && !Array.isArray(valor) ? valor : null;
}

// Entrada de subcoleção (registro, conquista, crise, missão) precisa de `id`:
// é ele que vira o nome do documento no Firestore. Sem id não dá pra salvar,
// então a entrada é descartada — menos dado é melhor que dado que não sobe.
function comId(lista) {
    if (!Array.isArray(lista)) return [];
    return lista
        .filter((item) => objetoOuNulo(item) !== null)
        .filter((item) => item.id !== undefined && item.id !== null && item.id !== '');
}

function normalizarRegistros(valor) {
    return comId(valor)
        .filter((registro) => typeof registro.date === 'string' && DATA_VALIDA.test(registro.date))
        .map(normalizarRegistro);
}

// Mapa data -> reais economizados naquele dia. Chave fora do formato ou valor
// não numérico não entra: economia alimenta gráfico e meta de dinheiro.
function normalizarEconomia(valor) {
    const bruto = objetoOuNulo(valor);
    if (!bruto) return {};

    const saida = {};
    for (const [data, reais] of Object.entries(bruto)) {
        const numero = Number(reais);
        if (DATA_VALIDA.test(data) && !isNaN(numero)) {
            saida[data] = numero;
        }
    }
    return saida;
}

function normalizarDias(valor) {
    if (!Array.isArray(valor)) return [];
    return valor.filter((dia) => typeof dia === 'string' && DATA_VALIDA.test(dia));
}

// Devolve { ok: true, dados } no formato que substituirTodosOsDados espera, ou
// { ok: false, motivo: 'formato' } quando o arquivo não é um backup do app.
//
// O critério de "é um backup": ter a lista de registros. Um JSON qualquer sem
// ela seria importado como um app vazio, apagando tudo — que é o pior erro
// possível aqui.
export function normalizarBackup(bruto) {
    const raiz = objetoOuNulo(bruto);
    if (!raiz || !Array.isArray(raiz.registros)) {
        return { ok: false, motivo: 'formato' };
    }

    return {
        ok: true,
        dados: {
            registros: normalizarRegistros(raiz.registros),
            aparelho: objetoOuNulo(raiz.aparelho),
            // Backup gerado antes do histórico de aparelhos existir não tem a
            // lista: vai vazia, e quem lê trata `aparelho` como válido desde
            // sempre (mesmo fallback de obterHistoricoDeAparelhos).
            historicoDeAparelhos: normalizarHistorico(raiz.historicoDeAparelhos),
            // Mesma história da lista de vigências: backup antigo não tem
            // `dispositivos`, e quem lê deriva a lista do histórico.
            dispositivos: normalizarDispositivos(raiz.dispositivos),
            meta: objetoOuNulo(raiz.meta),
            metaDeDinheiro: objetoOuNulo(raiz.metaDeDinheiro),
            economia: normalizarEconomia(raiz.economia),
            conquistas: comId(raiz.conquistas),
            sessoesDeCrise: comId(raiz.sessoesDeCrise),
            missoes: comId(raiz.missoes),
            xp: objetoOuNulo(raiz.xp),
            diasDeAbertura: normalizarDias(raiz.diasDeAbertura),
        },
    };
}

// Abre o seletor de arquivos e devolve o conteúdo em texto, ou null se o
// usuário cancelou.
async function escolherArquivo() {
    const resultado = await DocumentPicker.getDocumentAsync({
        // application/json cobre o que o próprio app exporta; */* é a saída pra
        // quem salvou o arquivo num app que não marca o tipo (alguns
        // gerenciadores de nuvem entregam octet-stream).
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
        multiple: false,
    });

    if (resultado.canceled) return null;

    const arquivo = resultado.assets?.[0];
    if (!arquivo) return null;

    if (Platform.OS === 'web') {
        // No web o picker entrega o File do browser; o uri é um blob que o
        // expo-file-system não lê.
        return arquivo.file ? await arquivo.file.text() : null;
    }

    return await new File(arquivo.uri).text();
}

// Devolve { ok: true, resumo } ou { ok: false, motivo }:
//   'cancelado' -> o usuário fechou o seletor (não é erro, não mostra alerta)
//   'formato'   -> o arquivo não é um backup do VapeFree
//   'vazio'     -> é um backup, mas sem nenhum registro pra trazer
//   'rede'      -> conta logada sem internet (a escrita em massa exige rede)
//   'falhou'    -> não deu pra ler o arquivo
export async function importarBackup() {
    let texto;
    try {
        texto = await escolherArquivo();
    } catch (e) {
        console.log('Erro ao escolher o arquivo de backup:', e);
        return { ok: false, motivo: 'falhou' };
    }

    if (texto === null || texto === undefined) {
        return { ok: false, motivo: 'cancelado' };
    }

    let bruto;
    try {
        bruto = JSON.parse(texto);
    } catch {
        return { ok: false, motivo: 'formato' };
    }

    const normalizado = normalizarBackup(bruto);
    if (!normalizado.ok) {
        return { ok: false, motivo: normalizado.motivo };
    }

    // Backup só com listas vazias sobreporia tudo por nada — provavelmente o
    // usuário escolheu o arquivo errado.
    if (normalizado.dados.registros.length === 0) {
        return { ok: false, motivo: 'vazio' };
    }

    const resultado = await substituirTodosOsDados(normalizado.dados);
    if (!resultado.ok) {
        return { ok: false, motivo: resultado.motivo };
    }

    return {
        ok: true,
        resumo: {
            registros: normalizado.dados.registros.length,
            conquistas: normalizado.dados.conquistas.length,
        },
    };
}
