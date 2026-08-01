// Exportação dos dados do usuário (CSV ou JSON), pra ele levar o histórico
// pra onde quiser — o caso mais comum é mostrar pro médico.
//
// Lê tudo por utils/storage.js, então funciona igual pra convidado e pra conta
// (e offline, servido pelo espelho). Nada aqui escreve dado: é só leitura +
// geração de arquivo.
//
// Como o arquivo sai do app:
//   - nativo: grava no diretório de cache (expo-file-system) e abre a folha de
//     compartilhamento do sistema (expo-sharing);
//   - web: baixa via link temporário, porque expo-sharing não existe lá.

import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import {
    obterRegistros,
    obterAparelho,
    obterMeta,
    obterEconomia,
    obterConquistas,
    obterSessoesDeCrise,
    obterMissoes,
    obterEstadoDeXp,
} from './storage';
import { puxadasDoRegistro } from './records';
import { dataDeHoje } from './datas';

const COLUNAS_DO_CSV = [
    'data',
    'hora',
    'usou',
    'puxadas',
    'gatilhos',
    'ajudas',
    'intensidade',
    'economia_do_dia',
];

// Aspas duplas viram duas aspas e o campo inteiro vai entre aspas — regra do
// CSV (RFC 4180). Sem isso um gatilho "Outro; algo" quebraria a coluna.
function campoCsv(valor) {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    return `"${texto.replace(/"/g, '""')}"`;
}

function listaParaCampo(lista) {
    return Array.isArray(lista) ? lista.join(' | ') : '';
}

export function registrosParaCsv(registros, economia = {}) {
    const linhas = [COLUNAS_DO_CSV.join(',')];

    [...registros]
        .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))
        .forEach((registro) => {
            linhas.push(
                [
                    registro.date,
                    registro.time,
                    registro.used ? 'sim' : 'não',
                    puxadasDoRegistro(registro),
                    listaParaCampo(registro.triggers),
                    listaParaCampo(registro.helps),
                    registro.intensity ?? '',
                    economia[registro.date] ?? '',
                ]
                    .map(campoCsv)
                    .join(',')
            );
        });

    return linhas.join('\n');
}

// Junta tudo o que o app guarda do usuário. O CSV só tem os registros (é o que
// abre no Excel); o JSON leva o resto junto, pra exportação ser de verdade um
// backup do progresso.
async function carregarDados() {
    const [registros, aparelho, meta, economia, conquistas, sessoesDeCrise, missoes, xp] =
        await Promise.all([
            obterRegistros(),
            obterAparelho(),
            obterMeta(),
            obterEconomia(),
            obterConquistas(),
            obterSessoesDeCrise(),
            obterMissoes(),
            obterEstadoDeXp(),
        ]);

    return { registros, aparelho, meta, economia, conquistas, sessoesDeCrise, missoes, xp };
}

function nomeDoArquivo(formato) {
    return `vapefree-${dataDeHoje()}.${formato}`;
}

async function baixarNaWeb(nome, conteudo, tipo) {
    const blob = new Blob([conteudo], { type: `${tipo};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nome;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

async function compartilharNoNativo(nome, conteudo, tipo) {
    const arquivo = new File(Paths.cache, nome);
    // overwrite: exportar duas vezes no mesmo dia usa o mesmo nome de arquivo.
    arquivo.create({ overwrite: true });
    arquivo.write(conteudo);

    if (!(await Sharing.isAvailableAsync())) {
        return false;
    }

    await Sharing.shareAsync(arquivo.uri, {
        mimeType: tipo,
        dialogTitle: 'Exportar dados do VapeFree',
        UTI: tipo === 'text/csv' ? 'public.comma-separated-values-text' : 'public.json',
    });
    return true;
}

// formato: 'csv' | 'json'. Devolve { ok } ou { ok: false, motivo }:
//   'sem_dados'          -> não tem registro nenhum pra exportar
//   'sem_compartilhamento' -> o aparelho não tem folha de compartilhamento
//   'falhou'             -> erro ao gerar/gravar o arquivo
export async function exportarDados(formato = 'csv') {
    try {
        const dados = await carregarDados();

        if (dados.registros.length === 0) {
            return { ok: false, motivo: 'sem_dados' };
        }

        const ehCsv = formato === 'csv';
        const conteudo = ehCsv
            ? registrosParaCsv(dados.registros, dados.economia)
            : JSON.stringify({ exportadoEm: new Date().toISOString(), ...dados }, null, 2);
        const tipo = ehCsv ? 'text/csv' : 'application/json';
        const nome = nomeDoArquivo(ehCsv ? 'csv' : 'json');

        if (Platform.OS === 'web') {
            await baixarNaWeb(nome, conteudo, tipo);
            return { ok: true };
        }

        const compartilhou = await compartilharNoNativo(nome, conteudo, tipo);
        return compartilhou ? { ok: true } : { ok: false, motivo: 'sem_compartilhamento' };
    } catch (e) {
        console.log('Erro ao exportar dados:', e);
        return { ok: false, motivo: 'falhou' };
    }
}
