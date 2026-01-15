import { View, StyleSheet, Pressable, Animated, Modal } from 'react-native';
import { useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../lib/ThemeContext';
import { UsageCard } from './UsageCard';
import type { Usage } from '../lib/types';

interface Props {
  usage: Usage;
}

export function UsageBatteryIndicator({ usage }: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const maxUtilization = Math.max(
    usage.five_hour.utilization,
    usage.seven_day.utilization
  );

  // Gradient end color based on percentage (green -> yellow -> red)
  const getGradientEndColor = (pct: number) => {
    const t = pct / 100;
    const r = Math.round(255 * t);
    const g = Math.round(255 * (1 - t));
    return `rgb(${r}, ${g}, 0)`;
  };

  const fillWidth = Math.min(maxUtilization, 100);
  const gradientEndColor = getGradientEndColor(maxUtilization);

  const toggleExpanded = () => {
    if (expanded) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => setExpanded(false));
    } else {
      setExpanded(true);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 80,
          friction: 8,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  return (
    <>
      <Pressable
        onPress={toggleExpanded}
        style={({ pressed }) => [
          styles.container,
          pressed && { opacity: 0.7 }
        ]}
        hitSlop={12}
      >
        <View style={[styles.track, { backgroundColor: colors.surfaceSecondary }]}>
          <LinearGradient
            colors={['#00ff00', gradientEndColor]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.fill, { width: `${fillWidth}%` }]}
          />
        </View>
      </Pressable>

      <Modal
        visible={expanded}
        transparent
        animationType="none"
        onRequestClose={toggleExpanded}
      >
        <Pressable style={styles.overlay} onPress={toggleExpanded}>
          <Animated.View
            style={[
              styles.cardContainer,
              {
                opacity: fadeAnim,
                transform: [
                  {
                    scale: scaleAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1],
                    }),
                  },
                  {
                    translateY: scaleAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-20, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <UsageCard usage={usage} onClose={toggleExpanded} />
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginRight: 16,
  },
  track: {
    width: 52,
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-start',
    paddingTop: 100,
  },
  cardContainer: {
    marginHorizontal: 16,
  },
});
