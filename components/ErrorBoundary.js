// components/ErrorBoundary.js
// Última rede de proteção: exceção durante o render de qualquer tela derrubava
// a árvore inteira e deixava tela branca, sem log e sem saída. Aqui a exceção
// vira uma tela de erro com "Tentar de novo" (remonta os filhos) e um
// console.error com o stack de componentes.
//
// Precisa ser class component: getDerivedStateFromError/componentDidCatch não
// têm equivalente em hook.
//
// Paleta fixa própria (mesma exceção das telas de auth): o erro pode ter vindo
// justamente do ThemeProvider, então o fallback não pode depender de
// usarTema() — se dependesse, quebraria de novo ao tentar se desenhar.
import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

const CORES = {
  fundo: '#F9F9F9',
  card: '#FFFFFF',
  texto: '#1A1A1A',
  textoSecundario: '#555555',
  primaria: '#4CAF50',
  borda: '#E0E0E0',
};

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { erro: null };
  }

  static getDerivedStateFromError(erro) {
    return { erro };
  }

  componentDidCatch(erro, info) {
    // Sem serviço de crash reporting no projeto — por enquanto o log do
    // console é o único rastro. Se um dia entrar Sentry, é aqui que ele vai.
    console.error('[ErrorBoundary] exceção no render:', erro, info?.componentStack);
    if (typeof this.props.aoCapturar === 'function') {
      this.props.aoCapturar(erro, info);
    }
  }

  tentarDeNovo = () => {
    this.setState({ erro: null });
  };

  render() {
    const { erro } = this.state;
    if (!erro) return this.props.children;

    return (
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.conteudo}>
          <Text style={styles.emoji}>😕</Text>
          <Text style={styles.titulo}>Algo deu errado</Text>
          <Text style={styles.texto}>
            O app travou nesta tela, mas seus dados continuam salvos. Toque abaixo pra tentar de
            novo.
          </Text>

          <TouchableOpacity
            style={styles.botao}
            onPress={this.tentarDeNovo}
            accessibilityRole="button"
          >
            <Text style={styles.textoDoBotao}>Tentar de novo</Text>
          </TouchableOpacity>

          {/* Detalhe técnico só no desenvolvimento: em produção não ajuda o
              usuário e ainda pode vazar caminho de arquivo. */}
          {__DEV__ ? (
            <View style={styles.caixaDeDetalhe}>
              <Text style={styles.detalhe}>{String(erro?.message || erro)}</Text>
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: CORES.fundo },
  conteudo: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emoji: { fontSize: 48, marginBottom: 12 },
  titulo: {
    fontSize: 20,
    fontWeight: '700',
    color: CORES.texto,
    marginBottom: 8,
    textAlign: 'center',
  },
  texto: {
    fontSize: 14,
    color: CORES.textoSecundario,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  botao: {
    backgroundColor: CORES.primaria,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 12,
  },
  textoDoBotao: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  caixaDeDetalhe: {
    marginTop: 24,
    padding: 12,
    backgroundColor: CORES.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CORES.borda,
    maxWidth: '100%',
  },
  detalhe: { fontSize: 12, color: CORES.textoSecundario },
});
