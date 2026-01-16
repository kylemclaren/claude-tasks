import { useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Platform, Animated, ActionSheetIOS, Alert } from 'react-native';
import { Link, router } from 'expo-router';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Swipeable } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { useToggleTask, useRunTask, useDeleteTask } from '../hooks/useTasks';
import { useTheme } from '../lib/ThemeContext';
import { useToast } from '../lib/ToastContext';
import { getStatusColor, borderRadius, spacing } from '../lib/theme';
import { cronToHuman } from '../lib/cronToHuman';
import { Spinner } from './Spinner';
import type { Task } from '../lib/types';

interface Props {
  task: Task;
}

const useGlass = Platform.OS === 'ios' && typeof isLiquidGlassAvailable === 'function' && isLiquidGlassAvailable();

const ACTION_WIDTH = 80;

export function TaskCard({ task }: Props) {
  const swipeableRef = useRef<Swipeable>(null);
  const toggleMutation = useToggleTask();
  const runMutation = useRunTask();
  const deleteMutation = useDeleteTask();
  const { colors, shadows } = useTheme();
  const { showToast } = useToast();

  const formatRelativeTime = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const absDiff = Math.abs(diff);

    if (absDiff < 60000) return diff > 0 ? 'in < 1m' : '< 1m ago';
    if (absDiff < 3600000) {
      const mins = Math.round(absDiff / 60000);
      return diff > 0 ? `in ${mins}m` : `${mins}m ago`;
    }
    if (absDiff < 86400000) {
      const hours = Math.round(absDiff / 3600000);
      return diff > 0 ? `in ${hours}h` : `${hours}h ago`;
    }
    const days = Math.round(absDiff / 86400000);
    return diff > 0 ? `in ${days}d` : `${days}d ago`;
  };

  const handleToggle = () => {
    const willEnable = !task.enabled;
    toggleMutation.mutate(task.id, {
      onSuccess: () => {
        showToast(willEnable ? `${task.name} enabled` : `${task.name} disabled`);
      },
      onError: () => {
        showToast('Failed to update task', 'error');
      },
    });
    swipeableRef.current?.close();
  };

  const handleRun = () => {
    runMutation.mutate(task.id, {
      onSuccess: () => {
        showToast(`Running ${task.name}...`);
      },
      onError: () => {
        showToast('Failed to run task', 'error');
      },
    });
    swipeableRef.current?.close();
  };

  const handleDelete = () => {
    deleteMutation.mutate(task.id, {
      onSuccess: () => {
        showToast(`${task.name} deleted`);
      },
      onError: () => {
        showToast('Failed to delete task', 'error');
      },
    });
  };

  const confirmDelete = () => {
    if (Platform.OS === 'ios') {
      Alert.alert(
        'Delete Task',
        `Are you sure you want to delete "${task.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: handleDelete },
        ]
      );
    } else {
      Alert.alert(
        'Delete Task',
        `Are you sure you want to delete "${task.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', onPress: handleDelete },
        ]
      );
    }
  };

  const handleEdit = () => {
    router.push(`/task/edit/${task.id}`);
  };

  const handleLongPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    swipeableRef.current?.close();

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Cancel', 'Edit', 'Run Now', task.enabled ? 'Disable' : 'Enable', 'Delete'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 4,
          title: task.name,
        },
        (buttonIndex) => {
          switch (buttonIndex) {
            case 1:
              handleEdit();
              break;
            case 2:
              handleRun();
              break;
            case 3:
              handleToggle();
              break;
            case 4:
              confirmDelete();
              break;
          }
        }
      );
    } else {
      Alert.alert(
        task.name,
        'Choose an action',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Edit', onPress: handleEdit },
          { text: 'Run Now', onPress: handleRun },
          { text: task.enabled ? 'Disable' : 'Enable', onPress: handleToggle },
          { text: 'Delete', style: 'destructive', onPress: confirmDelete },
        ]
      );
    }
  };

  const renderLeftActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [0, ACTION_WIDTH],
      outputRange: [0.8, 1],
      extrapolate: 'clamp',
    });

    const opacity = dragX.interpolate({
      inputRange: [0, ACTION_WIDTH / 2, ACTION_WIDTH],
      outputRange: [0, 0.5, 1],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.leftAction, { opacity }]}>
        <Pressable
          onPress={handleToggle}
          style={[
            styles.actionButton,
            { backgroundColor: task.enabled ? colors.textMuted : colors.success },
          ]}
        >
          <Animated.Text
            style={[styles.actionText, { transform: [{ scale }] }]}
          >
            {task.enabled ? 'Disable' : 'Enable'}
          </Animated.Text>
        </Pressable>
      </Animated.View>
    );
  };

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const scale = dragX.interpolate({
      inputRange: [-ACTION_WIDTH, 0],
      outputRange: [1, 0.8],
      extrapolate: 'clamp',
    });

    const opacity = dragX.interpolate({
      inputRange: [-ACTION_WIDTH, -ACTION_WIDTH / 2, 0],
      outputRange: [1, 0.5, 0],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View style={[styles.rightAction, { opacity }]}>
        <Pressable
          onPress={handleRun}
          style={[styles.actionButton, { backgroundColor: colors.orange }]}
        >
          <Animated.Text
            style={[styles.actionText, { transform: [{ scale }] }]}
          >
            Run
          </Animated.Text>
        </Pressable>
      </Animated.View>
    );
  };

  const CardWrapper = useGlass ? GlassView : View;
  const statusColor = getStatusColor(task.last_run_status, colors);
  const enabledBgColor = task.enabled
    ? `${colors.success}25`
    : colors.surfaceSecondary;
  const enabledTextColor = task.enabled
    ? colors.success
    : colors.textMuted;

  const content = (
    <>
      <View style={styles.header}>
        {task.last_run_status === 'running' ? (
          <View style={styles.spinnerContainer}>
            <Spinner size={12} color={statusColor} strokeWidth={2} />
          </View>
        ) : (
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        )}
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>
          {task.name}
        </Text>
        <View style={[styles.badge, { backgroundColor: enabledBgColor }]}>
          <Text style={[styles.badgeText, { color: enabledTextColor }]}>
            {task.enabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
      </View>

      <Text style={[styles.cron, { color: colors.textSecondary }]}>
        {task.is_one_off
          ? task.scheduled_at
            ? `Once: ${new Date(task.scheduled_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
            : task.last_run_at
              ? 'One-off (completed)'
              : 'One-off'
          : cronToHuman(task.cron_expr)}
      </Text>

      <Text style={[styles.nextRun, { color: colors.textMuted }]}>
        {task.next_run_at ? `Next: ${formatRelativeTime(task.next_run_at)}` : 'Not scheduled'}
      </Text>
    </>
  );

  const cardStyle = useGlass
    ? styles.glassCard
    : [styles.card, { backgroundColor: colors.cardBackground }, shadows.md];

  return (
    <Swipeable
      ref={swipeableRef}
      renderLeftActions={renderLeftActions}
      renderRightActions={renderRightActions}
      leftThreshold={ACTION_WIDTH / 2}
      rightThreshold={ACTION_WIDTH / 2}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
      containerStyle={styles.swipeContainer}
    >
      <Link href={`/task/${task.id}`} asChild>
        <Pressable onLongPress={handleLongPress} delayLongPress={400}>
          <CardWrapper style={cardStyle} {...(useGlass && { glassEffectStyle: 'regular' })}>
            {content}
          </CardWrapper>
        </Pressable>
      </Link>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  swipeContainer: {
    marginHorizontal: spacing.lg,
    marginVertical: spacing.sm,
  },
  leftAction: {
    justifyContent: 'center',
    marginRight: -borderRadius.lg,
  },
  rightAction: {
    justifyContent: 'center',
    marginLeft: -borderRadius.lg,
  },
  actionButton: {
    width: ACTION_WIDTH + borderRadius.lg,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: borderRadius.lg / 2,
    borderRadius: borderRadius.lg,
  },
  actionText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  glassCard: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    overflow: 'hidden',
  },
  card: {
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  spinnerContainer: {
    width: 12,
    height: 12,
    marginRight: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  name: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  cron: {
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  nextRun: {
    fontSize: 12,
  },
});
