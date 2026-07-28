import React, { useState, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';

// Enquanto o card não foi medido ele conta como esta altura — no primeiro frame
// todos empatam e a distribuição vira round-robin, sem tudo empilhar numa coluna.
const ALTURA_PADRAO = 180;

// Distribui os filhos em N colunas independentes (masonry). Cada card entra na
// coluna mais curta no momento, na ordem original: preenche a coluna 1 enquanto
// ela for a mais baixa e só então pula pra 2 (reg1, reg2, reg3 | reg4, ...).
// Com colunas <= 1 devolve os filhos crus — celular fica byte a byte igual.
export default function GradeDeCards({ colunas = 1, espacamento = 0, children }) {
    const itens = React.Children.toArray(children).filter(Boolean);
    // Altura real de cada card, medida no layout. Chaveada pela key que o
    // toArray garante, não pelo índice: filtrar a lista não embaralha as medidas.
    const [alturas, setAlturas] = useState({});

    const medir = useCallback((chave, altura) => {
        setAlturas((atual) => (Math.abs((atual[chave] || 0) - altura) < 1 ? atual : { ...atual, [chave]: altura }));
    }, []);

    if (colunas <= 1) return <>{itens}</>;

    const porColuna = Array.from({ length: colunas }, () => []);
    const somas = Array.from({ length: colunas }, () => 0);

    itens.forEach((item) => {
        let menor = 0;
        // Empate vai pra coluna da esquerda — a tolerância evita que ruído de
        // float mande o card pro lado errado.
        for (let i = 1; i < colunas; i++) {
            if (somas[i] < somas[menor] - 0.5) menor = i;
        }
        porColuna[menor].push(
            <View key={item.key} onLayout={(e) => medir(item.key, e.nativeEvent.layout.height)}>
                {item}
            </View>
        );
        somas[menor] += alturas[item.key] || ALTURA_PADRAO;
    });

    return (
        <View style={[styles.grade, { columnGap: espacamento }]}>
            {porColuna.map((lista, i) => (
                <View key={i} style={styles.coluna}>
                    {lista}
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    grade: {
        flexDirection: 'row',
        alignItems: 'flex-start',
    },
    coluna: {
        flex: 1,
    },
});
