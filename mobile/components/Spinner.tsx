import { useRef, useEffect } from 'react';
import { Animated, StyleSheet, Easing, View } from 'react-native';
import { useTheme } from '../lib/ThemeContext';

interface Props {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Spinner({ size = 16, color, strokeWidth = 2 }: Props) {
  const { colors } = useTheme();
  const spinValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spin = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    spin.start();
    return () => spin.stop();
  }, [spinValue]);

  const rotate = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const spinnerColor = color || colors.orange;
  const arcSize = size - strokeWidth;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: size,
          height: size,
          transform: [{ rotate }],
        },
      ]}
    >
      {/* Background track */}
      <View
        style={[
          styles.track,
          {
            width: arcSize,
            height: arcSize,
            borderRadius: arcSize / 2,
            borderWidth: strokeWidth,
            borderColor: `${spinnerColor}30`,
          },
        ]}
      />
      {/* Spinning arc */}
      <View
        style={[
          styles.arc,
          {
            width: arcSize,
            height: arcSize,
            borderRadius: arcSize / 2,
            borderWidth: strokeWidth,
            borderColor: 'transparent',
            borderTopColor: spinnerColor,
            borderRightColor: spinnerColor,
          },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  track: {
    position: 'absolute',
  },
  arc: {
    position: 'absolute',
  },
});
