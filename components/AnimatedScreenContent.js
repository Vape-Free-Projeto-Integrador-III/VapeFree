// src/components/AnimatedScreenContent.js
// Embrulha a tela inteira (header incluso) e a reanima toda vez que a tela ganha foco,
// já que as telas das tabs ficam montadas e não remontam ao trocar de aba.
import React, { useRef } from 'react';
import { View, Animated, Easing } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';

const SLIDE_OFFSET = 55;

export default function AnimatedScreenContent({ type = 'fade', direction = 'right', backgroundColor, children }) {
    const progress = useRef(new Animated.Value(0)).current;

    useFocusEffect(
        useCallback(() => {
            progress.setValue(0);
            Animated.timing(progress, {
                toValue: 1,
                duration: type === 'slide' ? 340 : 300,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }).start();
        }, [type, direction])
    );

    const animatedStyle =
        type === 'slide'
            ? {
                  opacity: progress,
                  transform: [
                      {
                          translateX: progress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [direction === 'right' ? SLIDE_OFFSET : -SLIDE_OFFSET, 0],
                          }),
                      },
                  ],
              }
            : { opacity: progress };

    return (
        <View style={[{ flex: 1 }, backgroundColor && { backgroundColor }]}>
            <Animated.View style={[{ flex: 1 }, animatedStyle]}>{children}</Animated.View>
        </View>
    );
}
