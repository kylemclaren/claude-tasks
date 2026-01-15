import { View, StyleSheet, Pressable, Animated, Modal, Text } from 'react-native';
import { useRef, useState, useEffect } from 'react';
import { useTheme } from '../lib/ThemeContext';
import { RunningTasksCard } from './RunningTasksCard';
import { Spinner } from './Spinner';
import { borderRadius, spacing } from '../lib/theme';
import type { Task } from '../lib/types';

interface Props {
  tasks: Task[];
}

export function RunningTasksIndicator({ tasks }: Props) {
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const runningTasks = tasks.filter(t => t.last_run_status === 'running');
  const count = runningTasks.length;

  // Pulse animation when tasks are running
  useEffect(() => {
    if (count > 0) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [count, pulseAnim]);

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

  // Don't render if no tasks are running
  if (count === 0) return null;

  return (
    <>
      <Pressable
        onPress={toggleExpanded}
        style={({ pressed }) => [
          pressed && { opacity: 0.7 }
        ]}
        hitSlop={12}
      >
        <Animated.View
          style={[
            styles.container,
            { backgroundColor: `${colors.orange}20`, transform: [{ scale: pulseAnim }] },
          ]}
        >
          <Spinner size={14} color={colors.orange} strokeWidth={2} />
          <Text style={[styles.countText, { color: colors.orange }]}>
            {count}
          </Text>
        </Animated.View>
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
              <RunningTasksCard tasks={runningTasks} onClose={toggleExpanded} />
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
    marginRight: spacing.sm,
  },
  countText: {
    fontSize: 13,
    fontWeight: '700',
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
