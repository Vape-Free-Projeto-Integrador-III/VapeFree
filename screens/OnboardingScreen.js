// src/screens/OnboardingScreen.js
//
// Tutorial de boas-vindas, exibido UMA vez, na primeira abertura do app —
// antes de qualquer decisão de login (ver navigation/AppNavigator.js).
// Por isso ele não usa ScreenHeader nem faz parte de nenhum Stack: é uma tela
// solta, com callback `aoConcluir` em vez de `navigation`.
//
// A flag fica em AsyncStorage via concluirOnboarding() (utils/storage.js).

import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { usarTema } from '../context/ThemeContext';
import { RAIO, SOMBRA } from '../utils/theme';
import { concluirOnboarding } from '../utils/storage';

const PASSOS = [
  {
    id: 'boas_vindas',
    icone: 'leaf-outline',
    emoji: '🌱',
    titulo: 'Bem-vindo ao VapeFree',
    texto:
      'Aqui você acompanha sua saída do vape no seu ritmo. Sem julgamento, sem sermão — só você vendo seu progresso de verdade.',
  },
  {
    id: 'registrar',
    icone: 'add-circle-outline',
    emoji: '📅',
    titulo: 'Registre seu dia',
    texto:
      'Todo dia você marca se usou o vape e quantas puxadas deu. Leva 10 segundos. Dia sem usar também conta — e conta muito.',
  },
  {
    id: 'gatilhos',
    icone: 'flash-outline',
    emoji: '⚡',
    titulo: 'Descubra seus gatilhos',
    texto:
      'Ansiedade, tédio, estar com amigos... Ao registrar, você marca o que puxou a vontade. Com o tempo o app te mostra seu padrão.',
  },
  {
    id: 'economia',
    icone: 'wallet-outline',
    emoji: '💰',
    titulo: 'Veja quanto você economiza',
    texto:
      'Você cadastra o preço do seu aparelho e o app calcula o dinheiro que deixou de gastar. Costuma ser bem mais do que parece.',
  },
  {
    id: 'missoes',
    icone: 'trophy-outline',
    emoji: '🏆',
    titulo: 'Missões e conquistas',
    texto:
      'Missões diárias e semanais te dão XP, e as conquistas marcam cada passo grande. Quando a vontade apertar, use o modo crise.',
  },
];

export default function OnboardingScreen({ aoConcluir }) {
  const { cores } = usarTema();
  const { width } = useWindowDimensions();
  const [indice, setIndice] = useState(0);
  const listaRef = useRef(null);
  const finalizandoRef = useRef(false);

  const ehUltimo = indice === PASSOS.length - 1;

  async function finalizar() {
    // Evita gravar/avisar duas vezes se o usuário der dois toques rápidos.
    if (finalizandoRef.current) return;
    finalizandoRef.current = true;
    await concluirOnboarding();
    aoConcluir();
  }

  function avancar() {
    if (ehUltimo) {
      finalizar();
      return;
    }
    const proximo = indice + 1;
    listaRef.current?.scrollToIndex({ index: proximo, animated: true });
    setIndice(proximo);
  }

  // Mantém os pontinhos em sincronia quando o usuário arrasta em vez de
  // usar o botão.
  const aoRolar = useCallback(
    (evento) => {
      const atual = Math.round(evento.nativeEvent.contentOffset.x / width);
      setIndice((anterior) => (atual === anterior ? anterior : atual));
    },
    [width]
  );

  function renderizarPasso({ item }) {
    return (
      <View style={[styles.passo, { width }]}>
        <View style={[styles.circulo, { backgroundColor: cores.primaryLight }]}>
          <Ionicons name={item.icone} size={64} color={cores.primary} />
        </View>
        <Text style={styles.emoji}>{item.emoji}</Text>
        <Text style={[styles.titulo, { color: cores.text }]}>{item.titulo}</Text>
        <Text style={[styles.texto, { color: cores.textSecondary }]}>{item.texto}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: cores.background }]}>
      <View style={styles.topo}>
        {!ehUltimo ? (
          <TouchableOpacity onPress={finalizar} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={[styles.pular, { color: cores.textMuted }]}>Pular</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        ref={listaRef}
        data={PASSOS}
        keyExtractor={(item) => item.id}
        renderItem={renderizarPasso}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={aoRolar}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />

      <View style={styles.pontos}>
        {PASSOS.map((passo, i) => (
          <View
            key={passo.id}
            style={[
              styles.ponto,
              {
                backgroundColor: i === indice ? cores.primary : cores.border,
                width: i === indice ? 22 : 8,
              },
            ]}
          />
        ))}
      </View>

      <TouchableOpacity
        style={[styles.botao, { backgroundColor: cores.primary }, SOMBRA.media]}
        onPress={avancar}
        activeOpacity={0.85}
      >
        <Text style={styles.botaoTexto}>{ehUltimo ? 'Bora começar' : 'Próximo'}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: 32,
  },
  topo: {
    height: 56,
    paddingTop: 24,
    paddingHorizontal: 24,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  pular: {
    fontSize: 15,
    fontFamily: 'Poppins_600SemiBold',
  },
  passo: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  circulo: {
    width: 148,
    height: 148,
    borderRadius: 74,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 34,
    marginTop: 20,
  },
  titulo: {
    fontSize: 24,
    fontFamily: 'Poppins_800ExtraBold',
    textAlign: 'center',
    letterSpacing: -0.5,
    marginTop: 12,
  },
  texto: {
    fontSize: 15,
    fontFamily: 'Poppins_400Regular',
    textAlign: 'center',
    lineHeight: 23,
    marginTop: 12,
  },
  pontos: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  ponto: {
    height: 8,
    borderRadius: RAIO.full,
  },
  botao: {
    height: 52,
    marginHorizontal: 24,
    borderRadius: RAIO.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botaoTexto: {
    fontSize: 16,
    fontFamily: 'Poppins_700Bold',
    color: '#fff',
  },
});
